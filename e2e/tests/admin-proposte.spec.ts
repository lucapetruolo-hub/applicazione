import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { API_URL, WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";

/**
 * Proposte da approvare in Admin (docs/changelog/2026-11-03-automazioni-admin.md
 * e 2026-11-04-automazioni-admin-migliorie.md): "Approva" fa davvero la
 * modifica e la scrive nel registro, "No, mai" la ferma, "Riproponi" in
 * Andamento la rimette in Da approvare.
 */
const prisma = new PrismaClient();
const stamp = Date.now();
const KEYS = ["EXAMPLE_PHRASE:dogsitter", "EXAMPLE_PHRASE:babysitter"];
let adminId = "";
let examplesBefore = 0;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Cambia i dati: un giro solo, su telefono.");
});

test.beforeAll(async () => {
  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      adminRoles: ["SUPER"],
      adminTotpEnabledAt: new Date(Date.now() - 60_000),
      email: `admin-proposte-${stamp}@test.it`,
      name: "Admin",
      surname: "Proposte",
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
    },
  });
  adminId = admin.id;
  examplesBefore = await prisma.problemExample.count();
  // Le stesse che il calcolo della notte propone con le frasi di serie (Dogsitter e Babysitter non ne hanno).
  for (const [key, label, text] of [
    [KEYS[0], "Dogsitter", "Passeggiate per il cane"],
    [KEYS[1], "Babysitter", "Babysitter per la sera"],
  ] as const) {
    const payload = {
      title: `Frase d'esempio per ${label}`,
      why: `${label} non ha nessuna frase d'esempio sotto la ricerca.`,
      preview: { type: "lines", lines: [`In home, sotto la ricerca: «${text}»`] },
      data: { text, categorySlug: key.split(":")[1] },
    };
    await prisma.adminProposal.upsert({
      where: { key },
      create: { key, kind: "EXAMPLE_PHRASE", score: 900, payload },
      update: { status: "PENDING", score: 900, payload, snoozedUntil: null, decidedAt: null, decidedById: null },
    });
  }
});

test.afterAll(async () => {
  await prisma.adminProposal.deleteMany({ where: { key: { in: KEYS } } });
  // La frase si toglie dal sito (l'API tiene le frasi in memoria per 10 minuti),
  // poi le frasi tornano quelle di serie, come prima della prova.
  await fetch(`${API_URL}/admin/problem-match/examples/remove`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${testToken(adminId, { amfa: Math.floor(Date.now() / 1000) })}` },
    body: JSON.stringify({ text: "Passeggiate per il cane" }),
  });
  if (examplesBefore === 0) await prisma.problemExample.deleteMany({});
  await prisma.$disconnect();
});

test("Approva, No mai e Riproponi", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
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
  const panel = page.locator("section#da-approvare");
  await expect(panel.getByRole("heading", { name: /Da approvare/ })).toBeVisible();
  const dog = panel.locator("li.proposal").filter({ hasText: "Frase d'esempio per Dogsitter" });
  const baby = panel.locator("li.proposal").filter({ hasText: "Frase d'esempio per Babysitter" });
  await expect(dog).toBeVisible();
  await expect(baby).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).include("#da-approvare").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations).toEqual([]);

  // Approva: la frase c'è davvero, e il registro azioni lo dice.
  await dog.getByRole("button", { name: "Aggiungi la frase" }).click();
  await expect(panel.getByText(/Fatto: frase d'esempio per Dogsitter/)).toBeVisible();
  await expect(dog).toHaveCount(0);
  expect(await prisma.problemExample.count({ where: { text: "Passeggiate per il cane" } })).toBe(1);
  expect(await prisma.auditLog.count({ where: { entityType: "AdminProposal", entityId: KEYS[0], newValue: "APPROVED", changedByUserId: adminId } })).toBe(1);

  // No, mai: sparisce, e l'esito porta all'elenco in Andamento.
  await baby.getByRole("button", { name: "No, mai: Frase d'esempio per Babysitter" }).click();
  await expect(panel.getByText(/Non te la riproporremo: Frase d'esempio per Babysitter/)).toBeVisible();
  await expect(baby).toHaveCount(0);
  await panel.getByRole("link", { name: /Riproponila da Andamento/ }).click();

  // Riproponi: torna in Da approvare, perché serve ancora.
  await expect(page).toHaveURL(/\/admin\/andamento#proposte-rifiutate$/);
  const overview = page.locator("section.proposals-overview");
  await overview.getByText(/Fermate con "No, mai"/).click();
  await overview.getByRole("button", { name: "Riproponi: Frase d'esempio per Babysitter" }).click();
  await expect(overview.getByRole("status")).toContainText("è di nuovo in Da approvare");
  expect((await prisma.adminProposal.findUnique({ where: { key: KEYS[1] } }))?.status).toBe("PENDING");

  await page.goto("/admin");
  await expect(panel.locator("li.proposal").filter({ hasText: "Frase d'esempio per Babysitter" })).toBeVisible();
  await context.close();
});
