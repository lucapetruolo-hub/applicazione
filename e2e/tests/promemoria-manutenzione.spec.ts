import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, acceptQuote, createClient, createProfessional, createRequestWithQuotes, pageAsClient, wallDay } from "../fixtures/preventivi";

/**
 * "Ti servirà di nuovo?" a lavoro terminato (docs/changelog/2026-11-08-promemoria-manutenzione.md):
 * la scelta tipica del mestiere in evidenza, un tocco imposta il promemoria
 * (la data la decide il server), "Togli" lo cancella. L'avviso alla data è
 * provato nei test dell'API.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`ricordamelo dopo un lavoro di pulizie (${device})`, async ({ browser }) => {
    const client = await createClient(prisma);
    const pro = await createProfessional(prisma, "Casa Pulita Latina", "pulizie");
    const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(-3, "09:00"), description: "Pulizia di fondo di un appartamento di 80 metri." });
    const pulizie = await prisma.category.findFirstOrThrow({ where: { slug: "pulizie" } });
    await prisma.guidedRequest.update({ where: { id: request.id }, data: { categoryId: pulizie.id } });
    expect((await acceptQuote(client.id, quotes[0]!.id)).status).toBe(201);
    await prisma.booking.updateMany({ where: { guidedRequestId: request.id }, data: { status: "COMPLETED", clientConfirmedCompletedAt: new Date() } });

    const page = await pageAsClient(browser, client.id, size);
    await page.goto(`/le-mie-richieste?tab=lavori&open=${request.id}`);
    const group = page.getByRole("group", { name: "Ti servirà di nuovo?" });
    await expect(group).toBeVisible();
    // Per le pulizie la scelta tipica è "Tra 2 settimane", messa per prima.
    await expect(group.getByRole("button").first()).toHaveText("Tra 2 settimane");
    await expect(group.getByRole("button").first()).toHaveClass(/is-suggested/);
    // Senza recensione "Prenota di nuovo" sta nel riquadro.
    await expect(page.locator(".rebook-box").getByText("Prenota di nuovo")).toBeVisible();
    await group.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/promemoria-manutenzione-${device}.png` });

    await group.getByRole("button", { name: "Tra 1 anno" }).click();
    await expect(page.getByText(/^Te lo ricordiamo (il |l.)\d+ \w+ \d{4}$/)).toBeVisible();
    const state = await prisma.guidedRequestUserState.findFirstOrThrow({ where: { userId: client.id, guidedRequestId: request.id } });
    const days = (state.rebookRemindAt!.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(363);
    expect(days).toBeLessThan(366);
    await page.screenshot({ path: `test-results/promemoria-manutenzione-${device}-fatto.png` });

    // Solo il riquadro nuovo: il pulsante turchese "Lavoro terminato" della scheda ha un contrasto basso già noto, segnalato a parte.
    const axe = await new AxeBuilder({ page }).include(".rebook-box").analyze();
    expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);

    await page.getByRole("button", { name: "Togli" }).click();
    await expect(group).toBeVisible();
    await expect.poll(async () => (await prisma.guidedRequestUserState.findFirstOrThrow({ where: { id: state.id } })).rebookRemindAt).toBeNull();
    await page.context().close();
  });
}
