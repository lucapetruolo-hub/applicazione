import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { e2eData } from "../fixtures/data";

/**
 * Barra fissa "Richiedi un preventivo" nel profilo pubblico (docs/CHANGELOG.md
 * §385, §400). Compare quando il pulsante della pagina non è sullo schermo e
 * sparisce quando lo è; mai sui profili in pausa né al professionista sul
 * proprio profilo; il lettore di schermo sente il nome; il focus da tastiera
 * non finisce mai sotto la barra (WCAG 2.2, 2.4.11); nessun problema grave di
 * accessibilità (axe).
 */
const prisma = new PrismaClient();
const ids = { active: "", paused: "", longName: "", own: "" };
const LONG_NAME = "Impresa Idraulica e Termoidraulica dei Fratelli Bartolomeo e Massimiliano Santangelo";

const anonymous = {
  cookies: [],
  origins: [{ origin: WEB_URL, localStorage: [{ name: "cookie-consent-v1", value: "denied" }] }],
};

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name === "telefono-new-york", "Il fuso non cambia la barra: bastano un telefono e un computer.");
});

test.beforeAll(async () => {
  const stamp = Date.now();
  const passwordHash = await bcrypt.hash("Password123!", 10);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  // Abbastanza prestazioni da allungare la pagina oltre la prima schermata anche su un computer.
  const services = Array.from({ length: 14 }, (_, i) => ({ name: `Prestazione di prova ${i + 1}`, priceMinEurCents: 5000 + i * 1000 }));
  const profile = async (key: string, businessName: string, data: { pausedAt?: Date } = {}) => {
    const user = await prisma.user.create({
      data: { role: "PROFESSIONAL", email: `barra-${key}-${stamp}@test.it`, passwordHash, name: businessName, emailVerifiedAt: new Date(), legalConsentAt: new Date() },
    });
    const created = await prisma.professionalProfile.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        businessName,
        city: "Latina",
        latitude: 41.4677,
        longitude: 12.9036,
        bio: "Riparazioni, perdite d'acqua, caldaie e scarichi. Sopralluogo gratuito in tutta la provincia.",
        ...data,
        services: { create: services },
        fiscalProfile: { create: { entityType: "PRIVATE_INDIVIDUAL", fiscalFirstName: "Anna", fiscalLastName: "Verdi" } },
      },
    });
    return created.id;
  };
  ids.active = await profile("attivo", "Anna Verdi Idraulica");
  ids.paused = await profile("pausa", "Profilo in Pausa Idraulica", { pausedAt: new Date() });
  ids.longName = await profile("lungo", LONG_NAME);
  const own = await prisma.professionalProfile.findFirstOrThrow({ where: { userId: e2eData().userId } });
  await prisma.professionalService.createMany({ data: services.map((service) => ({ ...service, professionalProfileId: own.id })) });
  ids.own = own.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

const bar = (page: Page) => page.locator(".profile-cta-bar");
const inPageButton = (page: Page) => page.locator(".profile-cta");

async function waitForProfile(page: Page, name: string) {
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  // Il pulsante nella pagina c'è sempre: la barra si decide dopo averlo osservato.
  await expect(inPageButton(page)).toHaveCount(1);
}

test.describe("chi visita il profilo", () => {
  test.use({ storageState: anonymous });

  test("compare quando il pulsante non si vede e sparisce quando si vede", async ({ page }) => {
    await page.goto(`/professionista/${ids.active}`);
    await waitForProfile(page, "Anna Verdi Idraulica");

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(bar(page)).toHaveAttribute("data-visible", "true");
    await expect(bar(page)).toBeInViewport();
    // Il lettore di schermo sente a chi va la richiesta, anche dove il nome non si vede.
    await expect(page.getByRole("link", { name: "Richiedi un preventivo a Anna Verdi Idraulica" }).last()).toBeVisible();

    // Andamento del sito sa da quale pulsante parte la richiesta (§402).
    await expect(bar(page).locator("a")).toHaveAttribute("href", /[?&]da=barra(&|$)/);
    await expect(inPageButton(page).locator("a")).toHaveAttribute("href", /[?&]da=pagina(&|$)/);

    await inPageButton(page).scrollIntoViewIfNeeded();
    await expect(bar(page)).not.toHaveAttribute("data-visible", "true");
    // Nascosta davvero: fuori dalla tastiera e dal lettore di schermo.
    await expect(bar(page)).toHaveAttribute("aria-hidden", "true");
    await expect(bar(page)).toBeHidden();

    // In alto non c'è il "Richiedi preventivo" generico (§385).
    await expect(page.locator(".site-header-cta-link")).toBeHidden();
  });

  test("assente sul profilo in pausa", async ({ page }) => {
    await page.goto(`/professionista/${ids.paused}`);
    await expect(page.getByText("Al momento non accetta nuove richieste")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(bar(page)).toHaveCount(0);
    // Qui il "Richiedi preventivo" in alto resta: è l'unico modo di chiedere ad altri.
    await expect(page.locator(".site-header-cta-link")).toBeVisible();
  });

  test("\"Richiedi preventivo\" in alto c'è in home, non dentro la richiesta", async ({ page }) => {
    // Tornato in home (docs/changelog/2026-10-28-richiedi-preventivo-in-alto.md).
    await page.goto("/");
    // Sotto la ricerca resta solo la richiesta urgente; il campo dice che capisce anche il problema.
    await expect(page.getByLabel("Cosa ti serve?")).toHaveAttribute("placeholder", "Es. idraulico, un guasto");
    await expect(page.locator(".hero-urgent-link")).toHaveAttribute("href", "/urgente");
    await expect(page.locator(".hero-urgent-link")).toHaveAccessibleName("Richiesta urgente");
    await expect(page.getByRole("link", { name: "Richiedi un preventivo", exact: true })).toHaveCount(0);
    await expect(page.locator(".site-header-cta-link")).toBeVisible();
    await expect(page.locator(".site-header-cta-link")).toBeInViewport();
    await page.locator(".site-header-cta-link").click();
    await expect(page).toHaveURL(/\/preventivo$/);
    await expect(page.locator(".site-header-cta-link")).toHaveCount(0);
  });

  test("nome lunghissimo e profilo senza foto: niente esce dallo schermo", async ({ page }) => {
    await page.goto(`/professionista/${ids.longName}`);
    await waitForProfile(page, LONG_NAME);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(bar(page)).toHaveAttribute("data-visible", "true");
    const width = await page.evaluate(() => window.innerWidth);
    const box = await bar(page).locator(".profile-cta-bar-link").boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test("il focus da tastiera non finisce mai sotto la barra (WCAG 2.4.11)", async ({ page }) => {
    await page.goto(`/professionista/${ids.active}`);
    await waitForProfile(page, "Anna Verdi Idraulica");
    await page.locator("h1").first().click();
    const covered: string[] = [];
    for (let i = 0; i < 120; i++) {
      await page.keyboard.press("Tab");
      const problem = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const barEl = document.querySelector<HTMLElement>(".profile-cta-bar");
        if (!el || !barEl || barEl.contains(el) || barEl.dataset.visible !== "true") return null;
        const rect = el.getBoundingClientRect();
        const barTop = barEl.getBoundingClientRect().top;
        // Coperto del tutto: il bordo alto dell'elemento è sotto il bordo alto della barra.
        return rect.height > 0 && rect.top >= barTop ? `${el.tagName} "${(el.textContent ?? "").trim().slice(0, 40)}"` : null;
      });
      if (problem) covered.push(problem);
      if (await page.evaluate(() => document.activeElement === document.body)) break;
    }
    expect(covered).toEqual([]);
  });

  test("comparendo e sparendo la barra non sposta niente nella pagina (CLS 0)", async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __shifts: number[]; __loaded: boolean };
      w.__shifts = [];
      w.__loaded = false;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number })[]) if (w.__loaded) w.__shifts.push(entry.value);
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(`/professionista/${ids.active}`);
    await waitForProfile(page, "Anna Verdi Idraulica");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => {
      (window as unknown as { __loaded: boolean }).__loaded = true;
    });
    for (const y of [99999, 0, 99999]) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await page.waitForTimeout(400);
    }
    await inPageButton(page).scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => (window as unknown as { __shifts: number[] }).__shifts)).toEqual([]);
  });

  test("barra e briciole di pane senza problemi gravi di accessibilità", async ({ page }) => {
    await page.goto(`/professionista/${ids.active}`);
    await waitForProfile(page, "Anna Verdi Idraulica");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(bar(page)).toHaveAttribute("data-visible", "true");
    await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined))));
    const results = await new AxeBuilder({ page }).include(".profile-cta-bar").include(".profile-cta").include(".breadcrumbs").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
  });
});

test("il professionista sul proprio profilo non vede la barra", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("cookie-consent-v1", "denied"));
  await page.goto(`/professionista/${ids.own}`);
  await waitForProfile(page, "Marco Rossi Idraulica");
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  // La pagina arriva dal server senza sapere chi la guarda: la barra sparisce appena l'accesso è caricato.
  await expect(bar(page)).toHaveCount(0);
});
