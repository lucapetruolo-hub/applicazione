import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { COMPUTER, PHONE, createClient, createProfessional, pageAsClient } from "../fixtures/preventivi";

/**
 * "Ripeti la richiesta" ripropone i professionisti a cui era andata, con la
 * X per toglierli; chi non è più sul sito si toglie da solo; senza nessuno
 * diventa una richiesta generale
 * (docs/changelog/2026-11-10-ripeti-richiesta-scelti.md).
 */
const prisma = new PrismaClient();
const stamp = Date.now();

test.afterAll(() => prisma.$disconnect());

// Telefono e computer li sceglie la prova stessa: basta un giro.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Telefono e computer sono già dentro la prova.");
});

const card = (page: Page, text: string) => page.locator('[id^="request-"]', { hasText: text });

async function repeatFromMenu(page: Page, text: string) {
  await page.goto("/le-mie-richieste");
  const menu = card(page, text).getByLabel("Azioni sulla richiesta", { exact: true });
  await menu.scrollIntoViewIfNeeded();
  await menu.click();
  await page.getByRole("menu", { name: "Azioni sulla richiesta" }).getByText("Ripeti la richiesta", { exact: true }).click();
  await expect(page).toHaveURL(/\/preventivo\?/);
}

async function requestTo(clientId: string, description: string, target: { direct?: string; chosen?: string[] }) {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const ids = target.direct ? [target.direct] : (target.chosen ?? []);
  await prisma.guidedRequest.create({
    data: {
      clientId,
      categoryId: category.id,
      description,
      city: "Latina",
      status: "CLOSED",
      closedReason: "EXPIRED",
      professionalProfileId: target.direct ?? null,
      chosenProfileIds: target.chosen ?? [],
      leads: { create: ids.map((professionalProfileId) => ({ professionalProfileId, priceEurCents: 0 })) },
    },
  });
}

for (const [device, size] of [["telefono", PHONE], ["computer", COMPUTER]] as const) {
  test(`scelti riproposti con la X, chi non c'è più tolto (${device})`, async ({ browser }) => {
    const [first, second, gone] = await Promise.all(
      ["Acqua Pronta", "Tubi Lucidi", "Sifoni Spariti"].map((name) => createProfessional(prisma, `${name} ${device} ${stamp}`)),
    );
    await prisma.professionalProfile.update({ where: { id: gone!.id }, data: { deletedAt: new Date() } });
    const client = await createClient(prisma);
    await requestTo(client.id, "Scarico della doccia lento", { chosen: [first!.id, second!.id, gone!.id] });
    const page = await pageAsClient(browser, client.id, size);

    await repeatFromMenu(page, "Scarico della doccia lento");
    await expect(page.getByText("Stai inviando la richiesta ai 2 professionisti che hai scelto")).toBeVisible();
    await expect(page.getByText("Un professionista che avevi scelto non è più sul sito: l'abbiamo tolto.")).toBeVisible();
    await expect(page.getByText(gone!.businessName)).toHaveCount(0);
    await expect(page.getByLabel("Descrivi il lavoro")).toHaveValue("Scarico della doccia lento");
    await page.screenshot({ path: `test-results/ripeti-scelti-${device}.png` });

    // Tolto uno dei due: resta una richiesta diretta all'altro, la descrizione resta.
    await page.getByRole("button", { name: `Togli ${first!.businessName} dalla richiesta` }).click();
    await expect(page.getByText("Stai inviando una richiesta a")).toBeVisible();
    await expect(page.getByText(second!.businessName, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`professionista=${second!.id}`));
    await expect(page.getByLabel("Descrivi il lavoro")).toHaveValue("Scarico della doccia lento");
    await page.screenshot({ path: `test-results/ripeti-scelti-uno-${device}.png` });

    // Tolto anche l'ultimo: richiesta generale.
    await page.getByRole("button", { name: `Togli ${second!.businessName} dalla richiesta` }).click();
    await expect(page.getByText("Stai inviando")).toHaveCount(0);
    await expect(page.getByText(`Hai tolto ${second!.businessName}: la richiesta andrà ai professionisti della zona.`)).toBeVisible();
    await expect(page).not.toHaveURL(/professionista=|scelti=/);
    await expect(page.getByLabel("Descrivi il lavoro")).toHaveValue("Scarico della doccia lento");
    await page.screenshot({ path: `test-results/ripeti-generale-${device}.png` });
  });

  test(`richiesta diretta riproposta allo stesso professionista (${device})`, async ({ browser }) => {
    const pro = await createProfessional(prisma, `Caldaie Amiche ${device} ${stamp}`);
    const client = await createClient(prisma);
    await requestTo(client.id, "Caldaia in blocco", { direct: pro.id });
    const page = await pageAsClient(browser, client.id, size);

    await repeatFromMenu(page, "Caldaia in blocco");
    await expect(page.getByText("Stai inviando una richiesta a")).toBeVisible();
    await expect(page.getByText(pro.businessName, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Togli ${pro.businessName} dalla richiesta` })).toBeVisible();
    await page.screenshot({ path: `test-results/ripeti-diretta-${device}.png` });
  });
}
