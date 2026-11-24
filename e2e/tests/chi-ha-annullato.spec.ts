import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { API_URL } from "../fixtures/env";
import { acceptQuote, COMPUTER, createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, testToken, wallDay } from "../fixtures/preventivi";

/**
 * Sull'etichetta "Annullata" della scheda e su "Annullato" in Agenda si legge
 * chi ha annullato, quando e perché: col mouse passandoci sopra, da telefono
 * con un tocco (Luca, docs/changelog/2026-11-24-chi-ha-annullato-e-quando.md).
 */
const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

async function canceledJob(by: "CLIENT" | "PROFESSIONAL", time: string) {
  const client = await createClient(prisma, "Giulia");
  const pro = await createProfessional(prisma, "Marco Rossi Idraulica");
  const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(3, time) });
  const accepted = await acceptQuote(client.id, quotes[0].id);
  expect(accepted.status, await accepted.clone().text()).toBe(201);
  const booking = await prisma.booking.findUniqueOrThrow({ where: { quoteId: quotes[0].id } });
  const response =
    by === "CLIENT"
      ? await fetch(`${API_URL}/bookings/${booking.id}/cancel`, { method: "PATCH", headers: { Authorization: `Bearer ${testToken(client.id)}` } })
      : await fetch(`${API_URL}/bookings/${booking.id}/cancel-by-professional`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${testToken(pro.userId)}` },
          body: JSON.stringify({ note: "Mi è saltato il furgone, ti richiamo per un'altra data." }),
        });
  expect(response.ok, await response.clone().text()).toBe(true);
  const saved = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
  expect(saved.canceledBy).toBe(by);
  expect(saved.canceledAt).not.toBeNull();
  const lead = await prisma.lead.findFirstOrThrow({ where: { guidedRequestId: request.id, professionalProfileId: pro.id } });
  return { pro, request, lead, booking: saved };
}

function italianTime(date: Date): string {
  return date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
}

async function photo(page: Page, name: string, device: string) {
  if (process.env.FOTO_ANNULLATO) await page.screenshot({ path: `${process.env.FOTO_ANNULLATO}/${name}-${device}.png` });
}

for (const [device, settings] of [
  ["telefono", PHONE],
  ["computer", COMPUTER],
] as const) {
  test(`scheda della richiesta: chi ha annullato e quando (${device})`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "telefono-italia", "Il dispositivo lo sceglie la prova.");
    const { pro, request, lead, booking } = await canceledJob("CLIENT", "10:00");
    const page = await pageAsClient(browser, pro.userId, settings);
    await page.goto(`/dashboard/richieste?open=${request.id}`);
    const card = page.locator(`#request-${lead.id}`);
    const pill = card.getByTestId("canceled-info");
    await expect(pill).toBeVisible();
    const pop = page.getByTestId("canceled-info-pop");
    await expect(pop).toHaveCount(0);

    if (device === "computer") {
      await pill.hover();
      await expect(pop).toContainText("Annullata dal cliente");
      await expect(pop).toContainText(italianTime(booking.canceledAt!));
      await photo(page, "scheda-passaggio-mouse", device);
      await page.mouse.move(5, 5);
      await expect(pop).toHaveCount(0);
    }
    // Il tocco apre senza chiudere la scheda; un tocco fuori lo richiude.
    await pill.click();
    await expect(pop).toContainText("Annullata dal cliente");
    await expect(card.getByText("Descrizione lavoro", { exact: false }).first()).toBeVisible();
    await photo(page, "scheda-tocco", device);
    await page.mouse.click(5, settings.viewport.height - 5);
    await expect(pop).toHaveCount(0);
  });

  test(`Agenda: chi ha annullato, quando e il motivo (${device})`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "telefono-italia", "Il dispositivo lo sceglie la prova.");
    const { pro, booking } = await canceledJob("PROFESSIONAL", "15:00");
    const page = await pageAsClient(browser, pro.userId, settings);
    await page.goto(`/dashboard/agenda?booking=${booking.id}`);
    const sheet = page.getByRole("dialog", { name: /^Appuntamento con/ });
    const pill = sheet.getByTestId("canceled-info");
    await pill.click();
    const pop = page.getByTestId("canceled-info-pop");
    await expect(pop).toContainText("Annullato da te");
    await expect(pop).toContainText(italianTime(booking.canceledAt!));
    await expect(pop).toContainText("Mi è saltato il furgone");
    await photo(page, "agenda-tocco", device);
    // Esc chiude il riquadro ma non l'appuntamento.
    await page.keyboard.press("Escape");
    await expect(pop).toHaveCount(0);
    await expect(sheet).toBeVisible();
  });
}
