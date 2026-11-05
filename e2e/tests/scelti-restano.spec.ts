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

test.beforeAll(async () => {
  for (const name of names) await createProfessional(prisma, name, "idraulico");
});

test.afterAll(() => prisma.$disconnect());

test("la scelta resta tornando dal profilo, e dal profilo si sceglie", async ({ page }) => {
  await page.goto(`/cerca?problema=${encodeURIComponent("il rubinetto del bagno gocciola")}&citta=Latina`);
  const [first, second, third] = names as [string, string, string];

  await page.getByRole("button", { name: `Scegli ${first}` }).click();
  await page.getByRole("button", { name: `Scegli ${second}` }).click();
  const bar = page.getByRole("region", { name: "Professionisti scelti" });
  await expect(bar).toContainText("2 scelti su 5");

  // Profilo aperto dalla scheda, poi il tasto indietro del browser.
  await page.getByText(third, { exact: true }).first().click();
  await expect(page).toHaveURL(/\/professionista\/.*scelta=1/);
  await expect(page.getByRole("link", { name: "Torna ai risultati" })).toBeVisible();
  await expect(bar).toContainText("2 scelti su 5");
  await page.goBack();
  await expect(page.getByRole("button", { name: `Scelto: ${first}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Scelto: ${second}` })).toBeVisible();
  await expect(bar).toContainText("2 scelti su 5");

  // Di nuovo nel profilo: lo si sceglie da lì e si torna con il link.
  await page.getByText(third, { exact: true }).first().click();
  await page.getByRole("button", { name: `Scegli ${third}` }).click();
  await expect(bar).toContainText("3 scelti su 5");
  await page.getByRole("link", { name: "Torna ai risultati" }).click();
  await expect(page).toHaveURL(/\/cerca\?/);
  await expect(page.getByRole("button", { name: `Scelto: ${third}` })).toBeVisible();
  await expect(bar).toContainText("3 scelti su 5");
  await expect(bar.getByRole("link")).toHaveAttribute("href", /scelti=/);

  // Una ricerca diversa riparte da zero.
  await page.goto(`/cerca?problema=${encodeURIComponent("lo scarico del lavandino è intasato")}&citta=Latina`);
  await expect(page.getByRole("button", { name: /^Scelto:/ })).toHaveCount(0);
});

test("anche cercando il mestiere si scelgono più professionisti", async ({ page }) => {
  await page.goto("/cerca/idraulico/latina");
  const [first, second] = names as [string, string];

  await page.getByRole("button", { name: `Scegli ${first}` }).click();
  await page.getByRole("button", { name: `Scegli ${second}` }).click();
  const bar = page.getByRole("region", { name: "Professionisti scelti" });
  await expect(bar).toContainText("2 scelti su 5");

  // Il profilo e il ritorno, come dal problema scritto.
  await page.getByText(first, { exact: true }).first().click();
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
  await expect(page.getByText(first).first()).toBeVisible();
});

test("al sesto tocco su «Scegli» compare l'avviso del massimo", async ({ page }) => {
  await page.goto("/cerca/idraulico/latina");
  for (const name of names.slice(0, 5)) await page.getByRole("button", { name: `Scegli ${name}` }).click();
  const bar = page.getByRole("region", { name: "Professionisti scelti" });
  await expect(bar).toContainText("5 scelti su 5");
  // Spento ma toccabile: Playwright non clicca un aria-disabled senza force.
  await page.getByRole("button", { name: `Scegli ${names[5]}` }).click({ force: true });
  await expect(bar.getByRole("status")).toHaveText("Puoi sceglierne al massimo 5.");
  await expect(bar).toContainText("5 scelti su 5");
});
