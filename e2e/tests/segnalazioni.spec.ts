import { expect, test, type Browser } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@professionisti/database";
import { API_URL, WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";

/**
 * Percorso delle segnalazioni secondo il DSA (docs/CHANGELOG.md §319): chi
 * segnala un contenuto illegale spiega perché e conferma la buona fede,
 * riceve la presa in carico e poi l'esito senza motivazione; l'autore legge
 * misura, legge violata e motivazione nella pagina aperta dall'email e la
 * contesta; nel menu non c'è più "Segnalazioni e decisioni".
 */
const PASSWORD = "Password123!";
const prisma = new PrismaClient();
const people = { reporter: "", author: "", admin: "" };
let adminId = "";
let profileId = "";
let reviewId = "";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un telefono: il percorso non dipende dal fuso.");
  // Margine per l'attesa del limite sugli accessi (pageAs).
  testInfo.setTimeout(180_000);
});

test.beforeAll(async () => {
  const stamp = Date.now();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "elettricista" } });
  const user = (role: "CLIENT" | "PROFESSIONAL" | "ADMIN", key: string, name: string) =>
    prisma.user.create({
      data: { role, email: `${key}-${stamp}@test.it`, passwordHash, name, emailVerifiedAt: new Date(), legalConsentAt: new Date(), ...(role === "ADMIN" ? { adminRoles: ["SUPER"], adminTotpEnabledAt: new Date() } : {}) },
    });
  const pro = await user("PROFESSIONAL", "pro-segnalato", "Luigi");
  const author = await user("CLIENT", "autore", "Carla");
  const reporter = await user("CLIENT", "segnalante", "Sara");
  const admin = await user("ADMIN", "admin", "Admin");
  const profile = await prisma.professionalProfile.create({
    data: { userId: pro.id, categoryId: category.id, businessName: "Luigi Impianti", city: "Latina", latitude: 41.4677, longitude: 12.9036 },
  });
  const booking = await prisma.booking.create({ data: { clientId: author.id, professionalProfileId: profile.id, scheduledAt: new Date("2026-10-01T09:00:00Z"), status: "COMPLETED" } });
  const review = await prisma.review.create({ data: { bookingId: booking.id, rating: 1, comment: "Mi ha rubato gli attrezzi in garage." } });
  Object.assign(people, { reporter: reporter.email, author: author.email, admin: admin.email });
  profileId = profile.id;
  reviewId = review.id;
  adminId = admin.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function pageAs(browser: Browser, email: string | null) {
  // L'admin entra già passato dal codice della verifica in due passaggi (§351).
  let token: string | null = email === people.admin ? testToken(adminId, { amfa: Math.floor(Date.now() / 1000) }) : null;
  if (email && !token) {
    // L'accesso ha un limite di 10 al minuto per indirizzo: le altre prove
    // appena eseguite possono averlo esaurito, si aspetta e si riprova.
    for (let attempt = 0; !token; attempt++) {
      const response = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, (Number(response.headers.get("retry-after")) || 20) * 1000 + 500));
        continue;
      }
      expect(response.ok, `Accesso di prova non riuscito: ${response.status}`).toBe(true);
      token = ((await response.json()) as { token: string }).token;
    }
  }
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    storageState: {
      cookies: [],
      origins: [{ origin: WEB_URL, localStorage: [{ name: "cookie-consent-v1", value: "denied" }, ...(token ? [{ name: "professionisti_token", value: token }] : [])] }],
    },
  });
  return context.newPage();
}

test("segnalazione illegale, decisione e contestazione", async ({ browser }) => {
  // Chi segnala
  const reporterPage = await pageAs(browser, people.reporter);
  await reporterPage.goto(`/professionista/${profileId}`);
  await reporterPage.locator(`#recensione-${reviewId}`).locator("xpath=..").getByText("Segnala", { exact: true }).click();
  const dialog = reporterPage.getByRole("dialog", { name: "Segnala contenuto" });
  await dialog.getByLabel("Motivo").selectOption("insulti-minacce");
  await dialog.getByRole("button", { name: "Invia segnalazione" }).click();
  // Spiegazione e buona fede obbligatorie (DSA art. 16 c. 2).
  await expect(dialog.getByText("Scrivi almeno qualche parola.")).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveAttribute("aria-invalid", "true");
  await dialog.getByLabel("Perché è illegale").fill("Mi accusa di furto senza prove: è diffamazione.");
  // Sulla casella, non al centro della frase: lì c'è il link ai Termini.
  await dialog.getByRole("checkbox").click({ position: { x: 12, y: 12 } });
  await dialog.getByRole("button", { name: "Invia segnalazione" }).click();
  await expect(dialog.getByText("Segnalazione inviata")).toBeVisible();

  const report = await prisma.contentReport.findFirstOrThrow({ where: { targetId: reviewId } });
  expect(report.claimsIllegal).toBe(true);
  expect(report.goodFaithAt).not.toBeNull();
  const reporterUser = await prisma.user.findUniqueOrThrow({ where: { email: people.reporter } });
  expect((await prisma.notification.findMany({ where: { userId: reporterUser.id } })).map((n) => n.type)).toContain("CONTENT_REPORT_RECEIVED");

  // L'admin decide con la legge violata
  const adminPage = await pageAs(browser, people.admin);
  await adminPage.goto("/admin/segnalazioni");
  const card = adminPage
    .locator("div")
    .filter({ hasText: "Recensione su Luigi Impianti" })
    .filter({ has: adminPage.getByRole("button", { name: "Risolvi" }) })
    .last();
  await expect(card.getByText("Illegale secondo chi segnala")).toBeVisible();
  await card.getByRole("button", { name: "Risolvi" }).click();
  await adminPage.getByText("Nascondi la recensione").click();
  await expect(adminPage.getByRole("button", { name: "Applica misura" })).toBeDisabled();
  await adminPage.getByLabel("Regola o legge violata").selectOption("legge-diffamazione");
  await adminPage.getByLabel("Motivazione").fill("Accusa di furto senza alcun riscontro.");
  await adminPage.getByRole("button", { name: "Applica misura" }).click();
  // Decisa: esce da "Da gestire".
  await expect(adminPage.getByText("Recensione su Luigi Impianti")).toHaveCount(0);
  const decided = await prisma.contentReport.findUniqueOrThrow({ where: { id: report.id } });
  expect(decided).toMatchObject({ status: "RESOLVED", action: "HIDE_CONTENT", ground: "legge-diffamazione" });

  // A chi segnala solo l'esito, senza motivazione
  const decision = await prisma.notification.findFirstOrThrow({ where: { userId: reporterUser.id, type: "CONTENT_REPORT_DECISION" } });
  expect(decision.payload).toEqual({ targetType: "REVIEW", status: "RESOLVED" });

  // L'autore: nessuna voce di menu, la decisione si apre dal link dell'email e si contesta
  const authorPage = await pageAs(browser, people.author);
  await authorPage.goto("/account");
  await expect(authorPage.getByText("Segnalazioni e decisioni")).toHaveCount(0);
  await authorPage.goto("/segnalazioni");
  await expect(authorPage.getByText("Legge violata:")).toBeVisible();
  await expect(authorPage.getByText("Accusa di furto senza alcun riscontro.")).toBeVisible();
  await authorPage.getByRole("button", { name: "Contesta la decisione" }).click();
  await authorPage.getByLabel("Motivo della contestazione").fill("Ho la denuncia dei carabinieri, è tutto vero.");
  await authorPage.getByRole("button", { name: "Invia contestazione" }).click();
  await expect(authorPage.getByText("Contestazione in esame")).toBeVisible();
});

test("segnalazione di un contenuto illegale senza account", async ({ browser }) => {
  const page = await pageAs(browser, null);
  await page.goto("/");
  await page.getByRole("link", { name: "Segnala un contenuto illegale" }).click();
  await expect(page).toHaveURL(/\/contatti\?motivo=segnalazione/);
  const email = `vicino-${Date.now()}@test.it`;
  await page.getByLabel("La tua email").fill(email);
  await page.getByLabel("Cosa vuoi segnalare").fill(`${WEB_URL}/professionista/${profileId}: la recensione riporta il mio indirizzo di casa.`);
  await page.getByRole("button", { name: "Invia", exact: true }).click();
  await expect(page.getByText("Conferma che la segnalazione è fatta in buona fede.")).toBeVisible();
  await page.getByRole("checkbox").click({ position: { x: 12, y: 12 } });
  await page.getByRole("button", { name: "Invia", exact: true }).click();
  await expect(page.getByText("Segnalazione presa in carico")).toBeVisible();
  const message = await prisma.contactMessage.findFirstOrThrow({ where: { email } });
  expect(message.role).toBe("REPORT_ILLEGAL");
});
