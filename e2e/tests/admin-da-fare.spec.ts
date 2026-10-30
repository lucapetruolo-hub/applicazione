import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";

/**
 * Riordino dell'Admin (docs/changelog/2026-10-30-admin-riordino.md): "Da fare"
 * è una coda sola con prima i pericoli, "Prendo io" resta dopo il
 * ricaricamento, e il menu a 8 sezioni porta alle schede giuste.
 */
const prisma = new PrismaClient();
const stamp = Date.now();
let adminId = "";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia" && testInfo.project.name !== "computer-tokyo", "Un giro su telefono e uno su computer.");
});

test.beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      adminRoles: ["SUPER"],
      adminTotpEnabledAt: new Date(Date.now() - 60_000),
      email: `admin-da-fare-${stamp}@test.it`,
      name: "Admin",
      surname: "Coda",
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
    },
  });
  adminId = admin.id;
  const client = await prisma.user.create({
    data: { role: "CLIENT", email: `cliente-da-fare-${stamp}@test.it`, name: "Ugo", surname: `Coda${stamp}`, emailVerifiedAt: new Date(), legalConsentAt: new Date() },
  });
  // Il messaggio è più vecchio, ma il gas va in cima lo stesso.
  await prisma.contactMessage.create({
    data: { role: "CLIENT", email: `messaggio-${stamp}@test.it`, content: `Messaggio di prova ${stamp}`, createdAt: new Date(Date.now() - 48 * 3600_000) },
  });
  await prisma.problemTakeover.create({ data: { userId: client.id, description: `C'è odore di gas in cantina ${stamp}`, city: "Latina" } });
});

test.afterAll(() => prisma.$disconnect());

test("Da fare: pericoli in cima, Prendo io, menu a sezioni", async ({ browser }, testInfo) => {
  const isMobile = testInfo.project.name === "telefono-italia";
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    viewport: isMobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    isMobile,
    hasTouch: isMobile,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: WEB_URL,
          localStorage: [
            { name: "cookie-consent-v1", value: "denied" },
            { name: "professionisti_token", value: testToken(adminId, { amfa: Math.floor(Date.now() / 1000) }) },
          ],
        },
      ],
    },
  });
  const page = await context.newPage();
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Da fare" })).toBeVisible();

  const rows = page.locator("table.admin-queue tbody tr");
  const gas = rows.filter({ hasText: `odore di gas in cantina ${stamp}` });
  const message = rows.filter({ hasText: `Messaggio di prova ${stamp}` });
  await expect(gas).toBeVisible();
  await expect(message).toBeVisible();
  const texts = await rows.allTextContents();
  const gasIndex = texts.findIndex((t) => t.includes(`gas in cantina ${stamp}`));
  const messageIndex = texts.findIndex((t) => t.includes(`Messaggio di prova ${stamp}`));
  expect(gasIndex).toBeLessThan(messageIndex);
  await expect(gas.getByText("Pericolo", { exact: true })).toBeVisible();

  // "Prendo io" resta dopo il ricaricamento e si vede con "Presi da me".
  await gas.getByRole("button", { name: "Prendo io" }).click();
  await expect(gas.getByText("Preso da te")).toBeVisible();
  await page.goto("/admin?chi=mie");
  await expect(rows.filter({ hasText: `gas in cantina ${stamp}` }).getByText("Preso da te")).toBeVisible();
  await expect(rows.filter({ hasText: `Messaggio di prova ${stamp}` })).toHaveCount(0);
  await rows.filter({ hasText: `gas in cantina ${stamp}` }).getByRole("button", { name: "Lascia" }).click();
  await expect(rows.filter({ hasText: `gas in cantina ${stamp}` })).toHaveCount(0);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);

  // Dal menu: Fisco e fatture apre le sue due schede.
  await page.getByRole("navigation", { name: "Sezioni amministrazione" }).getByRole("link", { name: /Fisco e fatture/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fisco e fatture" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Schede di Fisco e fatture" });
  await tabs.getByRole("link", { name: "DAC7" }).click();
  await expect(page).toHaveURL(/\/admin\/finanza\/dac7$/);
  await expect(tabs.getByRole("link", { name: "DAC7" })).toHaveAttribute("aria-current", "page");

  await context.close();
});
