import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { acceptQuote, COMPUTER, createClient, createProfessional, createRequestWithQuotes, pageAsClient, PHONE, wallDay } from "../fixtures/preventivi";

/**
 * Il professionista vede subito come paga il cliente quando accetta, e nei
 * "Dettagli cliente" il nome dell'account resta quello cliccabile, con sotto
 * il nome scritto nella richiesta
 * (docs/changelog/2026-11-19-pagamento-scelto-al-professionista.md).
 */
const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

for (const [label, device] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`preventivo accettato: popup col pagamento e nome dell'account cliccabile (${label})`, async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: il percorso non dipende dal fuso.");
    // Account "Marco Verdi", nella richiesta "Giulia Bianchi" (chi riceve il professionista).
    const client = await createClient(prisma, "Marco");
    await prisma.user.update({ where: { id: client.id }, data: { surname: "Verdi" } });
    const pro = await createProfessional(prisma, "Andrea Idraulica");
    const { request, quotes } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(3, "10:00") });

    const page = await pageAsClient(browser, pro.userId, device);
    await page.goto(`/dashboard/richieste?open=${request.id}`);
    await expect(page.getByText("Dettagli cliente").first()).toBeVisible();
    // Il popup nasce solo per le notifiche arrivate dopo l'apertura della pagina.
    await page.waitForTimeout(1500);

    expect((await acceptQuote(client.id, quotes[0].id)).status).toBe(201);

    const toast = page.locator(".toast-card").first();
    // Nome dell'account, come nei "Dettagli cliente".
    await expect(toast).toContainText("Marco Verdi ha accettato il tuo preventivo", { timeout: 20_000 });
    await expect(toast).toContainText("Ti paga direttamente");
    await page.screenshot({ path: testInfo.outputPath(`popup-${label}.png`) });
    await toast.getByRole("button", { name: "Chiudi la notifica" }).click();

    await page.reload();
    const card = page.locator("main");
    const name = card.getByRole("button", { name: "Vedi il profilo di Marco Verdi" });
    await expect(name).toBeVisible();
    await expect(name).toContainText("Marco Verdi");
    await expect(card.getByText("Nome sulla richiesta:")).toBeVisible();
    await expect(card.getByText("Giulia Bianchi", { exact: true })).toBeVisible();
    await card.getByText("Dettagli cliente").first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`dettagli-${label}.png`) });

    // Agenda: stesso ordine nel pannello dell'appuntamento.
    await page.goto(`/dashboard/agenda?giorno=${quotes[0].estimatedStartDate.toISOString().slice(0, 10)}`);
    // Nel calendario resta il nome di chi riceve il professionista.
    await page.getByRole("button", { name: /Giulia Bianchi/ }).first().click();
    const panel = page.getByRole("dialog", { name: "Appuntamento con Marco Verdi" });
    await expect(panel.getByRole("heading", { name: "Marco Verdi" })).toBeVisible();
    await expect(panel.getByText("Nome sulla richiesta:")).toContainText("Giulia Bianchi");
    // Foto a pannello fermo, dopo l'animazione di apertura.
    await page.waitForTimeout(600);
    await page.screenshot({ path: testInfo.outputPath(`agenda-${label}.png`) });
  });
}
