import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, acceptQuote, createClient, createProfessional, createRequestWithQuotes, pageAsClient, wallDay } from "../fixtures/preventivi";

/**
 * "Lavori fatti tramite il sito" (docs/changelog/2026-11-08-lavori-fatti.md):
 * le foto di fine lavoro del professionista vanno sul suo profilo solo se il
 * cliente spunta la casella recensendo (spenta di serie), e spariscono quando
 * la toglie.
 */
const prisma = new PrismaClient();
const PHOTOS = ["https://res.cloudinary.com/demo/image/upload/v1/lavoro-1.jpg", "https://res.cloudinary.com/demo/image/upload/v1/lavoro-2.jpg"];

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`foto del lavoro sul profilo con l'ok del cliente (${device})`, async ({ browser }) => {
    const client = await createClient(prisma);
    const pro = await createProfessional(prisma, "Idraulica Rossi Latina");
    const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(-3, "09:00"), description: "Rubinetto della cucina che perde." });
    expect((await acceptQuote(client.id, quotes[0]!.id)).status).toBe(201);
    await prisma.booking.updateMany({
      where: { guidedRequestId: request.id },
      data: { status: "COMPLETED", clientConfirmedCompletedAt: new Date(), professionalCompletionPhotoUrls: PHOTOS },
    });

    const page = await pageAsClient(browser, client.id, size);
    await page.goto(`/le-mie-richieste?tab=lavori&open=${request.id}`);
    await page.getByRole("button", { name: "Lascia una recensione" }).click();
    const dialog = page.getByRole("dialog", { name: "Recensisci il professionista" });
    const consent = dialog.getByRole("checkbox", { name: /Mostra le foto del lavoro nel profilo di Idraulica Rossi Latina/ });
    // Spenta di serie: le foto sono di casa del cliente.
    await expect(consent).toHaveAttribute("aria-checked", "false");
    await consent.click();
    await expect(consent).toHaveAttribute("aria-checked", "true");
    await dialog.locator(".review-showcase").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/lavori-fatti-${device}-recensione.png` });
    const axe = await new AxeBuilder({ page }).include(".review-showcase").analyze();
    expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
    await dialog.getByRole("button", { name: "Invia recensione" }).click();
    await expect(dialog).toBeHidden();

    const review = await prisma.review.findFirstOrThrow({ where: { booking: { guidedRequestId: request.id } } });
    expect(review.showcaseConsentAt).not.toBeNull();
    // Account appena creati: la recensione resta in controllo (collaudo P-01), qui la si pubblica.
    await prisma.review.update({ where: { id: review.id }, data: { hiddenAt: null, heldAt: null } });

    const profile = await page.context().newPage();
    await profile.goto(`/professionista/${pro.id}`);
    const section = profile.getByText("Lavori fatti tramite il sito", { exact: true });
    await expect(section).toBeVisible();
    await expect(profile.getByText("2 foto")).toBeVisible();
    await section.scrollIntoViewIfNeeded();
    await profile.screenshot({ path: `test-results/lavori-fatti-${device}-profilo.png` });
    await profile.getByRole("button", { name: /Ingrandisci le foto del lavoro/ }).click();
    await expect(profile.getByRole("dialog")).toBeVisible();
    await profile.keyboard.press("Escape");

    // Il cliente toglie l'ok sotto "Recensione inviata": le foto spariscono dal profilo.
    const toggle = page.locator(".review-showcase-toggle").getByRole("checkbox");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect.poll(async () => (await prisma.review.findUniqueOrThrow({ where: { id: review.id } })).showcaseConsentAt).toBeNull();
    await profile.reload();
    await expect(profile.getByText("Recensioni", { exact: true })).toBeVisible();
    await expect(profile.getByText("Lavori fatti tramite il sito", { exact: true })).toHaveCount(0);
    await page.context().close();
  });
}
