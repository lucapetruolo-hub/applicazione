import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@professionisti/database";

/**
 * Badge del professionista e loro significato (docs/CHANGELOG.md §335).
 * Il badge "Verificato" compare solo con la verifica di documento e selfie
 * approvata, mai su un profilo dimostrativo; il fumetto si apre col mouse,
 * al tocco e col tasto Tab, si chiude con Esc, e il lettore di schermo
 * legge sempre la descrizione. Nessun problema grave di accessibilità (axe).
 */
const prisma = new PrismaClient();
const ids = { verified: "", demo: "", unverified: "" };
const VERIFIED_TEXT = "Ha confermato la sua identità. Non è una garanzia sulla qualità del lavoro.";
const PRIVATE_TEXT = "Lavora in modo occasionale, senza partita IVA. I diritti del consumatore, come il recesso, non si applicano.";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Il fuso non cambia i badge: bastano un telefono e un computer.");
});

test.beforeAll(async () => {
  const stamp = Date.now();
  const passwordHash = await bcrypt.hash("Password123!", 10);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const profile = async (key: string, businessName: string, data: { verified: boolean; isDemo?: boolean; verifiedAt?: Date }) => {
    const user = await prisma.user.create({
      data: { role: "PROFESSIONAL", email: `${key}-${stamp}@test.it`, passwordHash, name: businessName, emailVerifiedAt: new Date(), legalConsentAt: new Date() },
    });
    return prisma.professionalProfile.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        businessName,
        city: "Latina",
        latitude: 41.4677,
        longitude: 12.9036,
        ...data,
        fiscalProfile: { create: { entityType: "PRIVATE_INDIVIDUAL", fiscalFirstName: "Anna", fiscalLastName: "Verdi" } },
      },
    });
  };
  const verified = await profile("badge-verificato", "Anna Verdi Idraulica", { verified: true, verifiedAt: new Date() });
  await prisma.identityVerification.create({
    data: {
      professionalProfileId: verified.id,
      provider: "didit",
      providerSessionId: `e2e-${stamp}`,
      status: "APPROVED",
      providerStatus: "Approved",
      biometricConsentAt: new Date(),
      biometricConsentVersion: "2026-10-20",
      decidedAt: new Date(),
    },
  });
  ids.verified = verified.id;
  ids.demo = (await profile("badge-demo", "Vetrina Idraulica", { verified: true, isDemo: true })).id;
  ids.unverified = (await profile("badge-non-verificato", "Mario Neri Idraulica", { verified: false })).id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

// Il nome del pulsante è solo l'etichetta del badge: la descrizione arriva a parte.
const badge = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).first();
const bubble = (page: Page) => page.locator(".badge-info-pop");

test("Verificato solo con la verifica di documento e selfie approvata", async ({ page }) => {
  await page.goto(`/professionista/${ids.verified}`);
  await expect(badge(page, "Verificato")).toBeVisible();
  // Il lettore di schermo legge nome e significato anche a fumetto chiuso.
  await expect(badge(page, "Verificato")).toHaveAccessibleDescription(VERIFIED_TEXT);
  await expect(badge(page, "Privato")).toHaveAccessibleDescription(PRIVATE_TEXT);

  await page.goto(`/professionista/${ids.unverified}`);
  await expect(page.getByRole("heading", { name: "Mario Neri Idraulica" })).toBeVisible();
  await expect(badge(page, "Verificato")).toHaveCount(0);

  // Un profilo dimostrativo non è una persona verificata: niente badge.
  await page.goto(`/professionista/${ids.demo}`);
  await expect(page.getByRole("heading", { name: "Vetrina Idraulica" })).toBeVisible();
  await expect(badge(page, "Verificato")).toHaveCount(0);
});

test("il fumetto si apre e si chiude con mouse o tocco, tastiera ed Esc", async ({ page }, testInfo) => {
  await page.goto(`/professionista/${ids.verified}`);
  const verified = badge(page, "Verificato");
  await expect(verified).toBeVisible();

  if (testInfo.project.name === "computer-tokyo") {
    await verified.hover();
    await expect(bubble(page)).toContainText("Ha confermato la sua identità.");
    // Il mouse può passare sul fumetto senza che si chiuda (WCAG 1.4.13).
    await bubble(page).hover();
    await expect(bubble(page)).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(bubble(page)).toHaveCount(0);
  } else {
    await verified.tap();
    await expect(bubble(page)).toContainText("Ha confermato la sua identità.");
    await expect(page).toHaveURL(new RegExp(ids.verified));
    await verified.tap();
    await expect(bubble(page)).toHaveCount(0);
    await verified.tap();
    await page.locator("h1").first().tap();
    await expect(bubble(page)).toHaveCount(0);
  }

  // Tastiera: Tab fino al badge apre il fumetto, Esc lo chiude.
  await page.locator("h1").first().click();
  for (let i = 0; i < 60 && !(await verified.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(verified).toBeFocused();
  await expect(bubble(page)).toContainText("Ha confermato la sua identità.");
  await page.keyboard.press("Escape");
  await expect(bubble(page)).toHaveCount(0);
});

test("badge e fumetto senza problemi gravi di accessibilità", async ({ page }) => {
  await page.goto(`/professionista/${ids.verified}`);
  await badge(page, "Verificato").focus();
  await expect(bubble(page)).toBeVisible();
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))));
  const results = await new AxeBuilder({ page })
    .include("button.badge-info")
    .include(".badge-info-pop")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${violation.help} → ${node.html.slice(0, 160)}`));
  expect(serious).toEqual([]);
});
