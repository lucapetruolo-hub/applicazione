import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";

/**
 * Copertina del profilo pubblico (docs/changelog/2026-11-13-copertina-profilo.md
 * e 2026-11-16-copertina-da-computer.md): la pagina si apre già sotto la
 * copertina, come senza, e la foto si vede scorrendo in su. 180 px da
 * telefono, 260 da computer, 360 su uno schermo molto largo. Senza copertina
 * o con un `#` nel link nessuno scorrimento.
 */
const prisma = new PrismaClient();
const ids = { withCover: "", withoutCover: "" };

const anonymous = {
  cookies: [],
  origins: [{ origin: WEB_URL, localStorage: [{ name: "cookie-consent-v1", value: "denied" }] }],
};

test.use({ storageState: anonymous });

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Il fuso non cambia la copertina: bastano un telefono e un computer.");
});

test.beforeAll(async () => {
  const stamp = Date.now();
  const passwordHash = await bcrypt.hash("Password123!", 10);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  // Pagina lunga anche su uno schermo grande: lo scorrimento non deve fermarsi prima.
  const services = Array.from({ length: 14 }, (_, i) => ({ name: `Prestazione di prova ${i + 1}`, priceMinEurCents: 5000 + i * 1000 }));
  const profile = async (key: string, businessName: string, coverPreset: string | null) => {
    const user = await prisma.user.create({
      data: { role: "PROFESSIONAL", email: `copertina-${key}-${stamp}@test.it`, passwordHash, name: businessName, emailVerifiedAt: new Date(), legalConsentAt: new Date() },
    });
    const created = await prisma.professionalProfile.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        businessName,
        city: "Bologna",
        latitude: 44.4949,
        longitude: 11.3426,
        bio: "Perdite, scarichi, caldaie e bagni completi. Preventivo chiaro prima di iniziare.",
        coverPreset,
        services: { create: services },
        fiscalProfile: { create: { entityType: "PRIVATE_INDIVIDUAL", fiscalFirstName: "Marco", fiscalLastName: "Bianchi" } },
      },
    });
    return created.id;
  };
  ids.withCover = await profile("con", "Marco Bianchi Idraulica", "idraulico");
  ids.withoutCover = await profile("senza", "Luisa Neri Idraulica", null);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

const heading = (page: Page, name: string) => page.getByRole("heading", { name, exact: true });

/** Dove sta il nome del professionista sullo schermo all'apertura. */
async function openAndMeasure(page: Page, id: string, name: string, hash = "") {
  await page.goto(`/professionista/${id}${hash}`);
  await expect(heading(page, name)).toBeVisible();
  // Lo scorrimento parte prima del disegno e di nuovo dopo l'idratazione.
  await page.waitForLoadState("networkidle");
  const box = await heading(page, name).boundingBox();
  return { scrollY: await page.evaluate(() => window.scrollY), headingTop: box?.y ?? -1 };
}

function expectedSpace(width: number): number {
  if (width <= 660) return 180;
  if (width >= 1600) return 360;
  return 260;
}

test("si apre già sotto la copertina, come un profilo senza copertina", async ({ page }) => {
  const width = page.viewportSize()?.width ?? 0;
  const withCover = await openAndMeasure(page, ids.withCover, "Marco Bianchi Idraulica");
  expect(withCover.scrollY).toBe(expectedSpace(width));

  const withoutCover = await openAndMeasure(page, ids.withoutCover, "Luisa Neri Idraulica");
  expect(withoutCover.scrollY).toBe(0);
  // All'apertura il nome sta nello stesso punto: chi non scorre non vede differenze.
  expect(Math.abs(withCover.headingTop - withoutCover.headingTop)).toBeLessThanOrEqual(2);
});

test("scorrendo in su si vede la copertina", async ({ page }) => {
  await openAndMeasure(page, ids.withCover, "Marco Bianchi Idraulica");
  const cover = page.locator('img[src*="/copertine/idraulico"]').first();
  const before = await cover.boundingBox();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const after = await cover.boundingBox();
  expect(before && after).toBeTruthy();
  // In cima la copertina è scesa di tutto lo spazio nascosto all'apertura.
  expect(Math.round(after!.y - before!.y)).toBe(expectedSpace(page.viewportSize()?.width ?? 0));
});

test("con un # nel link non scorre sotto la copertina", async ({ page }) => {
  const opened = await openAndMeasure(page, ids.withCover, "Marco Bianchi Idraulica", "#prestazioni-che-non-esiste");
  expect(opened.scrollY).toBe(0);
});

test.describe("schermo molto largo", () => {
  test.use({ viewport: { width: 1680, height: 1050 } });

  test("da computer con schermo largo la copertina nascosta è più alta", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("computer"), "Solo da computer.");
    const opened = await openAndMeasure(page, ids.withCover, "Marco Bianchi Idraulica");
    expect(opened.scrollY).toBe(360);
  });
});
