import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, createClient, createProfessional, pageAsClient } from "../fixtures/preventivi";

/**
 * Richieste archiviate facili da ritrovare
 * (docs/changelog/2026-11-10-richieste-archiviate.md): "Archiviate" è una
 * scheda in vista, "Archivia" dice dove finisce la richiesta, dopo
 * l'archiviazione un messaggio offre "Annulla" e "Vedi archiviate", e in fondo
 * all'elenco una riga ricorda quante ce ne sono. Uguale per cliente e
 * professionista, da telefono e da computer.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Due richieste aperte dello stesso cliente allo stesso professionista (con due la pagina mostra l'elenco). */
async function setup() {
  const pro = await createProfessional(prisma, "Archivio Idraulica");
  const client = await createClient(prisma);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  for (const description of ["Perdita sotto il lavello della cucina", "Scaldabagno elettrico da sostituire"]) {
    const request = await prisma.guidedRequest.create({
      data: { clientId: client.id, categoryId: category.id, description, city: "Latina", serviceMode: "ONLINE", professionalProfileId: pro.id },
    });
    await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: pro.id, priceEurCents: 0 } });
  }
  const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });
  return { clientUserId: client.id, proUserId: owner.userId };
}

const card = (page: Page, text: string) => page.locator('[id^="request-"]', { hasText: text });
// Le schede di stato hanno il numero nel nome ("Tutte 1"): così non si confondono con "Tutte" di A domicilio/Online.
const tab = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name}( \\d+)?$`) }).and(page.locator("[aria-pressed]")).first();

async function archiveFromMenu(page: Page, text: string) {
  const menu = card(page, text).getByLabel("Azioni sulla richiesta", { exact: true });
  // La tendina si chiude allo scorrimento: prima si porta il pulsante a vista.
  await menu.scrollIntoViewIfNeeded();
  await menu.click();
  await expect(page.getByText("La ritrovi in Archiviate")).toBeVisible();
  await page.getByText("Archivia", { exact: true }).click();
}

async function checkArchivedFlow(page: Page, path: string, shot: string) {
  await page.goto(path);
  await expect(card(page, "lavello")).toHaveCount(1);
  // "Archiviate" è tra le schede in vista, senza aprire i Filtri.
  await expect(tab(page, "Archiviate")).toBeVisible();
  // Senza archiviate, nessuna riga in fondo.
  await expect(page.getByText(/richiest[ae] archiviat[ae]$/)).toHaveCount(0);

  await archiveFromMenu(page, "lavello");
  const notice = page.getByRole("status").filter({ hasText: "Richiesta archiviata." });
  await expect(notice).toBeVisible();
  await expect(card(page, "lavello")).toHaveCount(0);
  await page.screenshot({ path: `test-results/archiviate-${shot}-messaggio.png` });

  // "Annulla" la riporta subito tra le altre.
  await notice.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(card(page, "lavello")).toHaveCount(1);
  await expect(notice).toHaveCount(0);

  // Di nuovo, e questa volta "Vedi archiviate" apre la scheda.
  await archiveFromMenu(page, "lavello");
  await page.getByRole("button", { name: "Vedi archiviate" }).click();
  await expect(tab(page, "Archiviate")).toHaveAttribute("aria-pressed", "true");
  await expect(card(page, "lavello")).toHaveCount(1);
  await expect(card(page, "Scaldabagno")).toHaveCount(0);
  await page.screenshot({ path: `test-results/archiviate-${shot}-scheda.png` });

  // Tornati a "Tutte", la riga in fondo dice quante sono e ci riporta.
  await page.getByRole("button", { name: /^Tutte \d+$/ }).click();
  const row = page.getByText("Hai 1 richiesta archiviata");
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeVisible();
  await page.screenshot({ path: `test-results/archiviate-${shot}-riga.png` });
  await page.getByRole("button", { name: "Vedi", exact: true }).click();
  await expect(tab(page, "Archiviate")).toHaveAttribute("aria-pressed", "true");
  await expect(card(page, "lavello")).toHaveCount(1);

  // Nei Filtri la tendina ha un'etichetta in vista e non ripete "Archiviate".
  await page.getByRole("button", { name: /^Filtri/ }).click();
  const show = page.getByRole("dialog", { name: "Filtri" }).getByRole("combobox", { name: "Mostra" });
  await expect(show).toBeVisible();
  await expect(show.locator("option")).toHaveText([/In corso e terminate/, /Annullate/, /Chiuse/]);
  await page.screenshot({ path: `test-results/archiviate-${shot}-filtri.png` });
  await page.keyboard.press("Escape");

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
}

for (const [device, size] of [
  ["telefono", PHONE],
  ["computer", COMPUTER],
] as const) {
  test(`cliente: archiviate in vista, messaggio e riga in fondo (${device})`, async ({ browser }) => {
    const { clientUserId } = await setup();
    const page = await pageAsClient(browser, clientUserId, size);
    await checkArchivedFlow(page, "/le-mie-richieste", `cliente-${device}`);
    await page.context().close();
  });

  test(`professionista: archiviate in vista, messaggio e riga in fondo (${device})`, async ({ browser }) => {
    const { proUserId } = await setup();
    const page = await pageAsClient(browser, proUserId, size);
    await checkArchivedFlow(page, "/dashboard/richieste", `professionista-${device}`);
    await page.context().close();
  });
}
