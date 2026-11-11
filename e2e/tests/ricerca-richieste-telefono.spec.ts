import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, createClient, createProfessional, pageAsClient } from "../fixtures/preventivi";

/**
 * Ricerca delle richieste del cliente sempre a vista
 * (docs/changelog/2026-11-11-ricerca-fuori-dai-filtri.md): da telefono la
 * casella sta nella riga di "Filtri", non dentro il pannello; da computer
 * resta in una riga sua. Scrivere filtra subito l'elenco.
 */
const prisma = new PrismaClient();

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto: telefono e computer si provano qui dentro.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const pro = await createProfessional(prisma, "Ricerca Idraulica");
  const client = await createClient(prisma);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  for (const description of ["Perdita sotto il lavello della cucina", "Scaldabagno elettrico da sostituire"]) {
    const request = await prisma.guidedRequest.create({
      data: { clientId: client.id, categoryId: category.id, description, city: "Latina", serviceMode: "ONLINE", professionalProfileId: pro.id },
    });
    await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: pro.id, priceEurCents: 0 } });
  }
  return client.id;
}

const cards = '[id^="request-"]';

for (const [name, device] of [
  ["telefono", PHONE],
  ["computer", COMPUTER],
] as const) {
  test(`${name}: la ricerca è sulla pagina e filtra senza aprire Filtri`, async ({ browser }) => {
    const clientId = await setup();
    const page = await pageAsClient(browser, clientId, device);
    await page.goto("/le-mie-richieste");
    await expect(page.locator(cards)).toHaveCount(2);

    const search = page.getByRole("textbox", { name: "Cerca nelle richieste" }).filter({ visible: true });
    await expect(search).toHaveCount(1);
    await page.screenshot({ path: `test-results/ricerca-richieste-${name}.png` });

    await search.fill("scaldabagno");
    await expect(page.locator(cards)).toHaveCount(1);
    await expect(page.locator(cards).first()).toContainText("Scaldabagno");

    if (name === "telefono") {
      // Casella e "Filtri" nella stessa riga, alti uguali.
      const filters = page.getByRole("button", { name: /^Filtri/ });
      const [a, b] = [await search.boundingBox(), await filters.boundingBox()];
      expect(Math.abs((a?.y ?? 0) - (b?.y ?? 99))).toBeLessThan(2);
      expect(Math.abs((a?.height ?? 0) - (b?.height ?? 99))).toBeLessThan(2);
      // Il pannello non ha più una seconda casella di ricerca.
      await filters.click();
      await expect(page.getByRole("dialog").getByRole("textbox", { name: "Cerca nelle richieste" })).toHaveCount(0);
    }
    await page.context().close();
  });
}
