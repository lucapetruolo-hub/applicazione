import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { createProfessional } from "../fixtures/preventivi";

/**
 * Professionisti scelti nei risultati, dal problema o dal mestiere
 * (docs/changelog/2026-11-03-scelti-restano.md, 2026-11-03-scegli-ricerca-mestiere.md): aprendo un profilo e
 * tornando indietro, con il tasto del browser o con "Torna ai risultati",
 * la scelta resta; dal profilo si può scegliere anche quel professionista.
 */
// Come un cliente che non ha ancora un account.
test.use({ storageState: { cookies: [], origins: [] } });

const prisma = new PrismaClient();
const stamp = Date.now();
const names = ["Acqua Sicura", "Tubi Bianchi", "Rubinetti Verdi", "Scarichi Liberi", "Caldaie Nord", "Sifoni Sud"].map((name) => `${name} ${stamp}`);

// A Rieti, dove nessun'altra prova crea professionisti: a Latina gli idraulici delle altre prove
// sono più di una pagina di risultati (20) e questi, senza recensioni, finirebbero dopo la prima.
// Quelli dei giri precedenti (altri progetti, nuovi tentativi) si tolgono come un profilo eliminato.
const RIETI = { city: "Rieti", latitude: 42.40295, longitude: 12.86083 };

test.beforeAll(async () => {
  await prisma.professionalProfile.updateMany({ where: { city: RIETI.city, deletedAt: null }, data: { deletedAt: new Date() } });
  for (const name of names) {
    const profile = await createProfessional(prisma, name, "idraulico");
    await prisma.professionalProfile.update({ where: { id: profile.id }, data: RIETI });
  }
});

test.afterAll(() => prisma.$disconnect());

test("la scelta resta tornando dal profilo, e dal profilo si sceglie", async ({ page }) => {
  await page.goto(`/cerca?problema=${encodeURIComponent("il rubinetto del bagno gocciola")}&citta=Rieti`);
  const [first, second, third] = names as [string, string, string];

  await page.getByRole("button", { name: `Scegli ${first}` }).click();
  await page.getByRole("button", { name: `Scegli ${second}` }).click();
  const bar = page.getByRole("region", { name: "Professionisti scelti" });
  await expect(bar).toContainText("2 scelti su 5");

  // Profilo aperto dalla scheda, poi il tasto indietro del browser.
  await page.getByText(third, { exact: true }).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/professionista\/.*scelta=1/);
  await expect(page.getByRole("link", { name: "Torna ai risultati" })).toBeVisible();
  await expect(bar).toContainText("2 scelti su 5");
  await page.goBack();
  await expect(page.getByRole("button", { name: `Scelto: ${first}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Scelto: ${second}` })).toBeVisible();
  await expect(bar).toContainText("2 scelti su 5");

  // Di nuovo nel profilo: lo si sceglie da lì e si torna con il link.
  await page.getByText(third, { exact: true }).filter({ visible: true }).first().click();
  await page.getByRole("button", { name: `Scegli ${third}` }).click();
  await expect(bar).toContainText("3 scelti su 5");
  await page.getByRole("link", { name: "Torna ai risultati" }).click();
  await expect(page).toHaveURL(/\/cerca\?/);
  await expect(page.getByRole("button", { name: `Scelto: ${third}` })).toBeVisible();
  await expect(bar).toContainText("3 scelti su 5");
  await expect(bar.getByRole("link")).toHaveAttribute("href", /scelti=/);

  // L'anteprima sopra i risultati: la X toglie solo quel professionista
  // (docs/changelog/2026-11-16-anteprima-scelti.md).
  const preview = page.locator(".chosen-strip");
  await expect(preview).toContainText("Scelti 3 su 5");
  await preview.getByRole("button", { name: `Togli ${second} dai scelti` }).click();
  await expect(preview).toContainText("Scelti 2 su 5");
  await expect(page.getByRole("button", { name: `Scegli ${second}` })).toBeVisible();
  await expect(bar).toContainText("2 scelti su 5");
  // "Annulla" lo rimette, per qualche secondo.
  await preview.getByRole("button", { name: "Annulla" }).click();
  await expect(preview).toContainText("Scelti 3 su 5");
  await expect(page.getByRole("button", { name: `Scelto: ${second}` })).toBeVisible();

  // Una ricerca diversa riparte da zero.
  await page.goto(`/cerca?problema=${encodeURIComponent("lo scarico del lavandino è intasato")}&citta=Rieti`);
  await expect(page.getByRole("button", { name: /^Scelto:/ })).toHaveCount(0);
});

test("anche cercando il mestiere si scelgono più professionisti", async ({ page }) => {
  await page.goto("/cerca/idraulico/rieti");
  const [first, second] = names as [string, string];

  await page.getByRole("button", { name: `Scegli ${first}` }).click();
  await page.getByRole("button", { name: `Scegli ${second}` }).click();
  const bar = page.getByRole("region", { name: "Professionisti scelti" });
  await expect(bar).toContainText("2 scelti su 5");
  // La stessa anteprima con la X sopra i risultati.
  await expect(page.locator(".chosen-strip")).toContainText("Scelti 2 su 5");

  // Il profilo e il ritorno, come dal problema scritto.
  await page.getByText(first, { exact: true }).filter({ visible: true }).first().click();
  await expect(page.getByRole("link", { name: "Torna ai risultati" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("button", { name: `Scelto: ${second}` })).toBeVisible();

  // La richiesta va solo ai scelti; la descrizione si scrive nel modulo.
  const href = await bar.getByRole("link").getAttribute("href");
  expect(href).toContain("categoria=idraulico");
  expect(href).toContain("scelti=");
  expect(href).not.toContain("descrizione=");
  // Come un cliente al primo accesso: prima risponde al banner dei cookie, che sta sopra la barra.
  await page.getByRole("button", { name: "Rifiuta" }).click();
  await bar.getByRole("link").click();
  await expect(page).toHaveURL(/\/preventivo\?/);
  await expect(page.getByText(first).filter({ visible: true }).first()).toBeVisible();
});

test("al sesto tocco su «Scegli» compare l'avviso del massimo", async ({ page }) => {
  await page.goto("/cerca/idraulico/rieti");
  for (const name of names.slice(0, 5)) await page.getByRole("button", { name: `Scegli ${name}` }).click();
  const bar = page.getByRole("region", { name: "Professionisti scelti" });
  await expect(bar).toContainText("5 scelti su 5");
  // Spento ma toccabile: Playwright non clicca un aria-disabled senza force. Con force però non
  // controlla che sopra il pulsante non ci sia altro: da computer il tocco finiva sulla barra in
  // alto. Prima si porta il pulsante a metà schermo, lontano dalla barra in alto e da quella in basso.
  const sixth = page.getByRole("button", { name: `Scegli ${names[5]}` });
  await sixth.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await sixth.click({ force: true });
  await expect(bar.getByRole("status")).toHaveText("Puoi sceglierne al massimo 5.");
  await expect(bar).toContainText("5 scelti su 5");
});

// Risultati a pagine da 20 (docs/changelog/2026-11-16-pagine-da-20.md): la scelta resta anche sfogliando.
test.describe("con più di una pagina di risultati", () => {
  const VITERBO = { city: "Viterbo", latitude: 42.41694, longitude: 12.1045 };
  const many = Array.from({ length: 21 }, (_, i) => `Pagine ${String(i + 1).padStart(2, "0")} ${stamp}`);

  test.beforeAll(async () => {
    await prisma.professionalProfile.updateMany({ where: { city: VITERBO.city, deletedAt: null }, data: { deletedAt: new Date() } });
    for (const name of many) {
      const profile = await createProfessional(prisma, name, "idraulico");
      await prisma.professionalProfile.update({ where: { id: profile.id }, data: VITERBO });
    }
  });

  test("la scelta resta passando alla seconda pagina", async ({ page }) => {
    await page.goto("/cerca/idraulico/viterbo");
    const pager = page.getByRole("navigation", { name: "Pagine dei risultati" });
    await expect(pager).toContainText("Da 1 a 20 di 21 professionisti");
    const firstPage = page.getByRole("button", { name: /^Scegli Pagine \d+ / }).first();
    const chosen = ((await firstPage.getAttribute("aria-label")) ?? "").replace(/^Scegli /, "");
    await firstPage.click();
    const bar = page.getByRole("region", { name: "Professionisti scelti" });
    await expect(bar).toContainText("1 scelto su 5");

    await pager.getByRole("link", { name: "Pagina 2" }).click();
    await expect(page).toHaveURL(/pagina=2/);
    await expect(pager).toContainText("Da 21 a 21 di 21 professionisti");
    await page.getByRole("button", { name: /^Scegli Pagine \d+ / }).first().click();
    await expect(bar).toContainText("2 scelti su 5");

    await pager.getByRole("link", { name: "Pagina 1" }).click();
    await expect(page.getByRole("button", { name: `Scelto: ${chosen}` })).toBeVisible();
    await expect(bar).toContainText("2 scelti su 5");
  });
});
