import { expect, test } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@professionisti/database";

/**
 * Bollini delle schede della ricerca sul telefono
 * (docs/changelog/2026-11-06-filtro-pagamenti-online.md): sotto i 660px
 * "Nuovo profilo" e "Assicurazione RC" stanno dietro un "+N", che li mostra
 * al tocco senza aprire il profilo; "Sponsorizzato" resta sempre in vista.
 * Su un telefono stretto come l'iPhone SE (320px) nome e bollini non escono
 * dalla scheda. Sul computer nessun "+N".
 */
test.use({ storageState: { cookies: [], origins: [] } });

const prisma = new PrismaClient();
const NAME = `Idraulica Fratelli Bianchi di Latina ${Date.now().toString(36)}`;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Il fuso non cambia i bollini: bastano un telefono e un computer.");
});

test.beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const user = await prisma.user.create({
    data: {
      role: "PROFESSIONAL",
      email: `bollini-telefono-${Date.now()}@test.it`,
      passwordHash: await bcrypt.hash("Password123!", 10),
      name: NAME,
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
    },
  });
  const profile = await prisma.professionalProfile.create({
    data: {
      userId: user.id,
      categoryId: category.id,
      businessName: NAME,
      city: "Latina",
      latitude: 41.4677,
      longitude: 12.9036,
      hasLiabilityInsurance: true,
      fiscalProfile: { create: { entityType: "SOLE_PROPRIETOR", fiscalFirstName: "Luigi", fiscalLastName: "Bianchi" } },
    },
  });
  await prisma.visibilityBoost.create({ data: { professionalProfileId: profile.id, type: "BOOST_LOCALE" } });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

const SEARCH = "/cerca?categoria=idraulico&citta=Latina";

test("sul telefono i bollini secondari stanno dietro il +N e niente esce dalla scheda", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "computer-tokyo", "Il +N c'è solo sul telefono.");
  // iPhone SE: il telefono più stretto ancora in uso.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(SEARCH);
  const name = page.getByText(NAME, { exact: true });
  await expect(name).toBeVisible();
  // La riga di nome e bollini di questa scheda (contiene il suo "Sponsorizzato").
  const card = name.locator("xpath=ancestor::*[.//button[starts-with(normalize-space(.), 'Sponsorizzato')]][1]");
  const more = card.getByRole("button", { name: "Mostra altri 2 bollini" });
  await expect(more).toBeVisible();
  await expect(card.getByRole("button", { name: "Sponsorizzato", exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Assicurazione RC dichiarata", exact: true })).toBeHidden();
  await expect(card.getByRole("button", { name: "Nuovo profilo", exact: true })).toBeHidden();

  // Niente sporge oltre il bordo destro della scheda, né la pagina scorre di lato.
  const overflow = () =>
    name.evaluate((el) => {
      let box: Element = el;
      while (box.parentElement && box.getBoundingClientRect().width < window.innerWidth * 0.8) box = box.parentElement;
      const right = box.getBoundingClientRect().right + 1;
      const out = [...box.querySelectorAll("*")]
        .filter((child) => child.getClientRects().length > 0 && child.getBoundingClientRect().right > right)
        .map((child) => (child.textContent ?? "").slice(0, 40));
      return { out, pageScroll: document.documentElement.scrollWidth > window.innerWidth };
    });
  expect(await overflow()).toEqual({ out: [], pageScroll: false });

  await more.tap();
  await expect(page).toHaveURL(/\/cerca/);
  await expect(card.getByRole("button", { name: "Assicurazione RC dichiarata", exact: true })).toBeVisible();
  await expect(card.getByRole("button", { name: "Nuovo profilo", exact: true })).toBeVisible();
  await expect(more).toHaveCount(0);
  expect(await overflow()).toEqual({ out: [], pageScroll: false });
});

test("sul computer tutti i bollini sono in vista, senza +N", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "computer-tokyo", "Solo sul computer.");
  await page.goto(SEARCH);
  await expect(page.getByText(NAME, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Mostra (altri|un altro)/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Assicurazione RC dichiarata", exact: true }).first()).toBeVisible();
});
