import { createHash, randomBytes } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { testToken } from "../fixtures/preventivi";
import { API_URL, WEB_URL } from "../fixtures/env";

/**
 * Conferma dell'email con il pulsante dell'email
 * (docs/changelog/2026-10-28-verifica-email-con-link.md). Aprire il link non
 * conferma nulla finché non si tocca il pulsante (gli antivirus della posta
 * aprono i link da soli); con l'accesso già fatto conferma da sola. Il link
 * vale una volta sola: riaperto dice "già confermata", scaduto lo dice e
 * porta a una nuova email. La pagina d'attesa si aggiorna da sola quando si
 * conferma da un altro dispositivo, e il codice resta di riserva.
 */
const prisma = new PrismaClient();
const anonymous = { cookies: [], origins: [{ origin: WEB_URL, localStorage: [{ name: "cookie-consent-v1", value: "denied" }] }] };

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Il fuso non cambia la conferma: bastano un telefono e un computer.");
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

let counter = 0;

/** Professionista con l'email da confermare e un link (e un codice) appena mandati. */
async function unverifiedProfessional(options: { linkHoursLeft?: number; code?: string } = {}) {
  const token = randomBytes(32).toString("base64url");
  const stamp = `${Date.now()}-${++counter}`;
  const user = await prisma.user.create({
    data: {
      role: "PROFESSIONAL",
      email: `conferma-${stamp}@gmail.com`,
      name: "Marco",
      legalConsentAt: new Date(),
      emailTokenHash: createHash("sha256").update(token).digest("hex"),
      emailTokenExpiresAt: new Date(Date.now() + (options.linkHoursLeft ?? 48) * 3600_000),
      emailCodeSentAt: new Date(),
    },
  });
  if (options.code) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailCodeHash: createHash("sha256").update(`${user.id}:${options.code}`).digest("hex"), emailCodeExpiresAt: new Date(Date.now() + 15 * 60_000), emailCodeAttempts: 0 },
    });
  }
  return { user, link: `/conferma-email?token=${encodeURIComponent(token)}`, token };
}

async function signedIn(browser: Browser, userId: string, viewport: { width: number; height: number } | null) {
  return browser.newContext({
    ...(viewport ? { viewport } : {}),
    storageState: {
      cookies: [],
      origins: [{ origin: WEB_URL, localStorage: [{ name: "cookie-consent-v1", value: "denied" }, { name: "professionisti_token", value: testToken(userId) }] }],
    },
  });
}

/** Tocco su "Conferma la mia email", fino all'esito sulla pagina. */
async function tapConfirm(page: Page) {
  await page.getByRole("button", { name: "Conferma la mia email" }).click();
  await expect(page.getByRole("heading", { name: /Email (già )?confermata|Il link è scaduto|Questo link non vale più/ })).toBeVisible();
}

async function verifiedAt(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerifiedAt;
}

test.describe("link aperto senza accesso", () => {
  test.use({ storageState: anonymous });

  test("aprire il link non conferma: serve il tocco; riaperto dice già confermata", async ({ page }) => {
    const { user, link } = await unverifiedProfessional();
    await page.goto(link);
    const confirm = page.getByRole("button", { name: "Conferma la mia email" });
    await expect(confirm).toBeVisible();
    // Come un antivirus che apre il link e aspetta: nulla cambia.
    await page.waitForTimeout(1500);
    expect(await verifiedAt(user.id)).toBeNull();

    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);

    await tapConfirm(page);
    await expect(page.getByRole("dialog", { name: "Email verificata con successo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Email confermata", exact: true })).toBeVisible();
    // Senza accesso il popup dice dove continuare: sul dispositivo dell'iscrizione.
    await expect(page.getByRole("dialog").getByText("lì la pagina si aggiorna da sola")).toBeVisible();
    expect(await verifiedAt(user.id)).not.toBeNull();

    await page.goto(link);
    await tapConfirm(page);
    await expect(page.getByRole("heading", { name: "Email già confermata" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("link scaduto: lo dice e porta all'accesso per una nuova email", async ({ page }) => {
    const { user, link } = await unverifiedProfessional({ linkHoursLeft: -1 });
    await page.goto(link);
    await tapConfirm(page);
    await expect(page.getByRole("heading", { name: "Il link è scaduto" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Accedi per riceverne una nuova" })).toHaveAttribute("href", "/accedi?redirect=/conferma-email");
    expect(await verifiedAt(user.id)).toBeNull();
  });

  test("link sostituito da una email più recente: non vale più", async ({ page }) => {
    await page.goto(`/conferma-email?token=${randomBytes(32).toString("base64url")}`);
    await tapConfirm(page);
    await expect(page.getByRole("heading", { name: "Questo link non vale più" })).toBeVisible();
  });
});

test("con l'accesso già fatto il link conferma da solo", async ({ browser }, testInfo) => {
  const { user, link } = await unverifiedProfessional();
  const context = await signedIn(browser, user.id, testInfo.project.use.viewport ?? null);
  const page = await context.newPage();
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Email confermata", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Continua" }).first()).toBeVisible();
  expect(await verifiedAt(user.id)).not.toBeNull();
  await context.close();
});

test("la pagina d'attesa si aggiorna da sola quando si conferma da un altro dispositivo", async ({ browser }, testInfo) => {
  const { user, token } = await unverifiedProfessional();
  const context = await signedIn(browser, user.id, testInfo.project.use.viewport ?? null);
  const page = await context.newPage();
  await page.goto("/conferma-email");
  await expect(page.getByText("Ti abbiamo mandato un'email a")).toBeVisible();
  await expect(page.getByRole("link", { name: "Apri Gmail" })).toHaveAttribute("href", "https://mail.google.com/");
  // Il codice è di riserva: le caselle non si vedono finché non si chiedono.
  await expect(page.getByLabel("Codice di 6 cifre")).toHaveCount(0);

  // "Dal telefono": il tocco sul pulsante dell'email.
  const response = await page.request.post(`${API_URL}/auth/verify-email`, { data: { token } });
  expect(response.ok()).toBe(true);
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  await context.close();
});

test("il codice di riserva conferma l'email", async ({ browser }, testInfo) => {
  const { user } = await unverifiedProfessional({ code: "482915" });
  const context = await signedIn(browser, user.id, testInfo.project.use.viewport ?? null);
  const page = await context.newPage();
  await page.goto("/conferma-email");
  await page.getByRole("button", { name: "Il pulsante non si apre? Usa il codice" }).click();
  await page.getByLabel("Codice di 6 cifre").fill("482915");
  await expect(page.getByText("Email confermata")).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  expect(await verifiedAt(user.id)).not.toBeNull();
  await context.close();
});
