import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, createClient, createProfessional, createRequestWithQuotes, pageAsClient, wallDay } from "../fixtures/preventivi";

/**
 * Confronto dei preventivi fianco a fianco (docs/changelog/2026-11-08-confronto-preventivi.md):
 * da 2 preventivi ancora accettabili compare "Confronta", la tabella segna il
 * prezzo più basso e la data più vicina, "Vedi e accetta" porta al preventivo
 * nella pagina (si accetta da lì), Escape chiude e il focus torna al pulsante.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`tre preventivi a confronto (${device})`, async ({ browser }) => {
    const client = await createClient(prisma);
    const pros = [await createProfessional(prisma, "Rapidi Idraulica"), await createProfessional(prisma, "Bianchi Impianti"), await createProfessional(prisma, "Studio Acqua Latina")];
    const { request, quotes } = await createRequestWithQuotes(prisma, client.id, pros.map((p) => p.id), { start: wallDay(5, "10:00") });
    // Il secondo prima degli altri; il primo è il più economico (80–120 €).
    // Tra 3 giorni: con 48 ore di preavviso a 2 giorni si sarebbe già dentro il preavviso.
    await prisma.quote.update({ where: { id: quotes[1]!.id }, data: { estimatedStartDate: wallDay(3, "09:00"), estimatedEndDate: wallDay(3, "11:00"), cancellationNoticeHours: 48 } });

    const page = await pageAsClient(browser, client.id, size);
    await page.goto(`/le-mie-richieste?open=${request.id}`);
    const open = page.getByRole("button", { name: "Confronta i 3 preventivi" });
    await expect(open).toBeVisible();
    await open.click();

    const dialog = page.getByRole("dialog", { name: "Confronta i preventivi" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("columnheader")).toHaveCount(3);
    for (const label of ["Prezzo", "Quando", "Pagamento", "Se annulli", "Recensioni", "Verificato", "Voci"]) {
      await expect(dialog.getByRole("rowheader", { name: label })).toBeVisible();
    }
    // Le colonne seguono l'ordine della pagina: si cerca quella del professionista.
    const headers = await dialog.getByRole("columnheader").allInnerTexts();
    const column = (name: string) => headers.findIndex((h) => h.includes(name));
    const priceRow = dialog.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Prezzo" }) });
    await expect(priceRow.getByRole("cell").nth(column("Rapidi Idraulica"))).toContainText("Prezzo più basso");
    await expect(priceRow.getByText("Prezzo più basso")).toHaveCount(1);
    const whenRow = dialog.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Quando" }) });
    await expect(whenRow.getByRole("cell").nth(column("Bianchi Impianti"))).toContainText("Data più vicina");
    await expect(whenRow.getByText("Data più vicina")).toHaveCount(1);
    await expect(dialog.getByText("Avvisa almeno 48 ore prima.")).toBeVisible();
    await page.screenshot({ path: `test-results/confronto-preventivi-${device}.png` });

    const axe = await new AxeBuilder({ page }).include(".quote-compare-dialog").analyze();
    expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);

    // Escape chiude e il focus torna al pulsante.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();

    // "Vedi e accetta" porta al preventivo, dove c'è il pulsante di sempre.
    await open.click();
    await dialog.getByRole("button", { name: "Vedi e accetta il preventivo di Studio Acqua Latina" }).click();
    await expect(dialog).toBeHidden();
    const target = page.locator(`#preventivo-${quotes[2]!.id}`);
    await expect(target).toBeFocused();
    await expect(target).toBeInViewport();
    await expect(target.getByText("Accetta preventivo", { exact: true })).toBeVisible();
    await page.context().close();
  });
}

test("con un solo preventivo il confronto non c'è", async ({ browser }) => {
  const client = await createClient(prisma);
  const pro = await createProfessional(prisma, "Unico Idraulica");
  const { request } = await createRequestWithQuotes(prisma, client.id, [pro.id], { start: wallDay(4, "10:00") });
  const page = await pageAsClient(browser, client.id, PHONE);
  await page.goto(`/le-mie-richieste?open=${request.id}`);
  await expect(page.getByText("Preventivi ricevuti")).toBeVisible();
  await expect(page.getByRole("button", { name: /Confronta i/ })).toHaveCount(0);
  await page.context().close();
});
