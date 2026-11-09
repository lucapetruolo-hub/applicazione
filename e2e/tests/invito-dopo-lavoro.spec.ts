import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { acceptQuote, createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, wallDay } from "../fixtures/preventivi";

/**
 * Dopo "Lavoro terminato" il professionista vede l'invito a mandare il suo
 * link, ma non a ogni lavoro: al massimo una volta ogni 30 giorni (decisione
 * di Luca del 09/11/2026, docs/changelog/2026-11-08-canale-del-professionista.md).
 */
const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

test("l'invito compare dopo il primo lavoro chiuso e non dopo il secondo", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un giro.");
  const pro = await createProfessional(prisma, "Marco Rossi Idraulica");
  const requests = [];
  for (const [name, time] of [["Giulia", "09:00"], ["Anna", "15:00"]] as const) {
    const client = await createClient(prisma, name);
    const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(-1, time) });
    const response = await acceptQuote(client.id, quotes[0].id);
    expect(response.status, await response.clone().text()).toBe(201);
    const lead = await prisma.lead.findFirstOrThrow({ where: { guidedRequestId: request.id, professionalProfileId: pro.id } });
    requests.push({ requestId: request.id, leadId: lead.id });
  }

  const page = await pageAsClient(browser, pro.userId, PHONE);
  const nudge = page.getByRole("status").filter({ hasText: "Hai altri clienti?" });
  for (const [index, { requestId, leadId }] of requests.entries()) {
    await page.goto(`/dashboard/richieste?open=${requestId}`);
    const card = page.locator(`#request-${leadId}`);
    await card.getByText("Lavoro terminato", { exact: true }).click();
    await page.getByRole("dialog", { name: "Segnala lavoro terminato" }).getByRole("textbox").first().fill("100");
    await page.getByRole("button", { name: "Conferma" }).click();
    if (index === 0) {
      await expect(nudge).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath("invito-dopo-lavoro.png") });
      await nudge.getByRole("button", { name: "Non ora" }).click();
      await expect(nudge).toHaveCount(0);
    } else {
      await expect(page.getByRole("button", { name: "Conferma" })).toHaveCount(0);
      // Il secondo lavoro dello stesso mese: niente invito.
      await page.waitForTimeout(500);
      await expect(nudge).toHaveCount(0);
    }
  }
});
