import { expect, test, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { testToken } from "../fixtures/preventivi";
import { WEB_URL } from "../fixtures/env";
import { stripe, stripeKey } from "./stripe";

/**
 * Iscrizione del professionista con la carta
 * (docs/changelog/2026-10-30-iscrizione-carta-solida.md): profilo, finestra
 * "Ora scegli il piano", Checkout di Stripe di prova e ritorno sul sito. Per
 * ogni carta di prova si guarda cosa vede il professionista, cosa scrive il
 * database e cosa mostra Stripe. Il primo addebito dopo i mesi gratis si
 * prova con un test clock di Stripe.
 */
const prisma = new PrismaClient();
const DAY = 24 * 60 * 60 * 1000;

test.skip(!stripeKey(), "Serve E2E_STRIPE_SECRET_KEY (chiave Stripe di prova).");

test.afterAll(async () => {
  await prisma.$disconnect();
});

let counter = 0;

async function newProfessional(options: { withProfile: boolean; stripeCustomerId?: string }) {
  const stamp = `${Date.now()}-${++counter}`;
  const user = await prisma.user.create({
    data: {
      role: "PROFESSIONAL",
      email: `carta-${stamp}@test.it`,
      name: "Paolo",
      surname: "Neri",
      phone: `+3935${stamp.replace(/\D/g, "").slice(-8)}`,
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
    },
  });
  if (!options.withProfile) return { user, profileId: null };
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const profile = await prisma.professionalProfile.create({
    data: {
      userId: user.id,
      categoryId: category.id,
      businessName: `Neri Impianti ${stamp}`,
      city: "Latina",
      latitude: 41.4677,
      longitude: 12.9036,
      stripeCustomerId: options.stripeCustomerId ?? null,
    },
  });
  // Come al primo salvataggio del profilo: 3 mesi gratis da oggi (lancio già passato).
  await prisma.subscription.create({
    data: { professionalProfileId: profile.id, plan: "FREE", status: "TRIALING", trialEndsAt: new Date(Date.now() + 90 * DAY), freeMonthsGranted: 3 },
  });
  return { user, profileId: profile.id };
}

async function signedIn(browser: Browser, userId: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: {
      cookies: [],
      origins: [{ origin: WEB_URL, localStorage: [{ name: "cookie-consent-v1", value: "denied" }, { name: "professionisti_token", value: testToken(userId) }] }],
    },
  });
  return context.newPage();
}

/** Da "Attiva i mesi gratis" alla pagina della carta di Stripe. */
async function openCheckout(page: Page) {
  await page.goto("/dashboard/abbonamento#livelli");
  await page.getByRole("button", { name: "Attiva i mesi gratis" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
}

async function fillCard(page: Page, number: string) {
  // Con più metodi di pagamento Stripe mostra un elenco: si apre "Carta".
  // Il pulsante della voce copre tutta la riga ed è trasparente: si attiva
  // con un evento di clic invece del clic del mouse.
  const cardNumber = page.locator("#cardNumber");
  const payWithCard = page.getByTestId("card-accordion-item-button");
  await expect.poll(async () => (await cardNumber.isVisible()) || (await payWithCard.count()) > 0, { timeout: 30_000 }).toBe(true);
  if (!(await cardNumber.isVisible())) await payWithCard.dispatchEvent("click");
  await expect(cardNumber).toBeVisible();
  await cardNumber.fill(number);
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
  await page.locator("#billingName").fill("Paolo Neri");
  const country = page.locator("#billingCountry");
  if (await country.isVisible().catch(() => false)) await country.selectOption("IT");
  await page.getByTestId("hosted-payment-submit-button").or(page.getByRole("button", { name: "Avvia prova" })).first().click();
}

/** Pulsante della finestra di prova del 3D Secure, in uno degli iframe di Stripe. */
async function complete3DSecure(page: Page) {
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          const button = frame.locator("#test-source-authorize-3ds");
          if (await button.isVisible().catch(() => false)) {
            await button.click();
            return true;
          }
        }
        return false;
      },
      { timeout: 60_000 },
    )
    .toBe(true);
}

async function subscriptionOf(profileId: string) {
  return prisma.subscription.findUniqueOrThrow({ where: { professionalProfileId: profileId } });
}

/** Il webhook di Stripe arriva dopo il ritorno sul sito: si aspetta la riga. */
async function waitForCard(profileId: string) {
  await expect.poll(async () => (await subscriptionOf(profileId)).cardAddedAt !== null, { timeout: 60_000 }).toBe(true);
  return subscriptionOf(profileId);
}

async function expectTrialOnStripe(stripeSubscriptionId: string, trialEndsAt: Date) {
  const subscription = await stripe<{ status: string; trial_end: number; latest_invoice: string }>("GET", `subscriptions/${stripeSubscriptionId}`);
  expect(subscription.status).toBe("trialing");
  // La fine su Stripe è quella del database (al secondo).
  expect(Math.abs(subscription.trial_end * 1000 - trialEndsAt.getTime())).toBeLessThan(2000);
  const invoice = await stripe<{ amount_paid: number; total: number }>("GET", `invoices/${subscription.latest_invoice}`);
  expect(invoice.total).toBe(0);
  expect(invoice.amount_paid).toBe(0);
}

test("profilo, finestra del piano e carta che passa (4242): 0 € oggi, mesi gratis su Stripe", async ({ browser }) => {
  const { user } = await newProfessional({ withProfile: false });
  const page = await signedIn(browser, user.id);
  await page.goto("/dashboard/profilo");
  await page.getByLabel("Nome attività").fill("Neri Impianti");
  const city = page.getByRole("combobox").first();
  await city.fill("Latina");
  await page.getByRole("option", { name: "Latina", exact: true }).click();
  await page.getByRole("group", { name: "Che lavori fai?" }).getByRole("button", { name: "Idraulico" }).click();
  await page.getByRole("button", { name: "Salva profilo" }).click();

  const dialog = page.getByRole("dialog", { name: "Scegli il piano" });
  await expect(dialog.getByText("Profilo salvato! Ora scegli il piano")).toBeVisible();
  await dialog.getByRole("button", { name: "Scegli il piano" }).click();
  await page.waitForURL(/\/dashboard\/abbonamento/);

  const profile = await prisma.professionalProfile.findUniqueOrThrow({ where: { userId: user.id } });
  const before = await subscriptionOf(profile.id);
  expect(before.stripeSubscriptionId).toBeNull();

  await page.getByRole("button", { name: "Attiva i mesi gratis" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
  await fillCard(page, "4242424242424242");
  await page.waitForURL(/\/dashboard\/abbonamento\?attivato=carta/, { timeout: 90_000 });
  await expect(page.getByText(/Fatto: carta salvata e mesi gratis attivi/)).toBeVisible();

  const after = await waitForCard(profile.id);
  expect(after.stripeSubscriptionId).toMatch(/^sub_/);
  expect(after.trialEndsAt?.getTime()).toBe(before.trialEndsAt?.getTime());
  await expectTrialOnStripe(after.stripeSubscriptionId!, after.trialEndsAt!);
});

test("carta con 3D Secure (3155): dopo la conferma della banca è come la 4242", async ({ browser }) => {
  const { user, profileId } = await newProfessional({ withProfile: true });
  const page = await signedIn(browser, user.id);
  await openCheckout(page);
  await fillCard(page, "4000002500003155");
  await complete3DSecure(page);
  await page.waitForURL(/\/dashboard\/abbonamento\?attivato=carta/, { timeout: 90_000 });
  await expect(page.getByText(/Fatto: carta salvata e mesi gratis attivi/)).toBeVisible();
  const after = await waitForCard(profileId!);
  await expectTrialOnStripe(after.stripeSubscriptionId!, after.trialEndsAt!);
});

test("carta rifiutata (9995): Stripe lo dice sulla sua pagina, nel database non cambia nulla", async ({ browser }) => {
  const { user, profileId } = await newProfessional({ withProfile: true });
  const page = await signedIn(browser, user.id);
  await openCheckout(page);
  await fillCard(page, "4000000000009995");
  await expect(page.getByText(/insufficient funds|fondi insufficienti|rifiutata|declined/i).first()).toBeVisible({ timeout: 60_000 });
  expect(page.url()).toMatch(/checkout\.stripe\.com/);
  const row = await subscriptionOf(profileId!);
  expect(row.stripeSubscriptionId).toBeNull();
  expect(row.cardAddedAt).toBeNull();
  expect(row.status).toBe("TRIALING");
});

test("pagina della carta chiusa a metà: si torna con il messaggio e si può riprovare", async ({ browser }) => {
  const { user, profileId } = await newProfessional({ withProfile: true });
  const page = await signedIn(browser, user.id);
  await openCheckout(page);
  // Il link "indietro" di Stripe porta al cancel_url.
  await page.locator('a[href*="annullato=1"]').first().click();
  await page.waitForURL(/\/dashboard\/abbonamento\?annullato=1/);
  await expect(page.getByText(/Non hai finito di aggiungere la carta/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Attiva i mesi gratis" })).toBeVisible();
  const row = await subscriptionOf(profileId!);
  expect(row.stripeSubscriptionId).toBeNull();
  expect(row.cardAddedAt).toBeNull();
});

test("primo addebito fallito dopo i mesi gratis (0341, test clock): abbonamento non pagato e avviso", async ({ browser }) => {
  const clock = await stripe<{ id: string }>("POST", "test_helpers/test_clocks", { frozen_time: Math.floor(Date.now() / 1000), name: "carta 0341" });
  const customer = await stripe<{ id: string }>("POST", "customers", { test_clock: clock.id, name: "Neri Impianti (prova)" });
  const { user, profileId } = await newProfessional({ withProfile: true, stripeCustomerId: customer.id });
  const page = await signedIn(browser, user.id);
  await openCheckout(page);
  await fillCard(page, "4000000000000341");
  await page.waitForURL(/\/dashboard\/abbonamento\?attivato=carta/, { timeout: 90_000 });
  const row = await waitForCard(profileId!);

  // Tre mesi dopo, più il tempo in cui Stripe tiene la fattura in bozza.
  await stripe("POST", `test_helpers/test_clocks/${clock.id}/advance`, { frozen_time: Math.floor(row.trialEndsAt!.getTime() / 1000) + 2 * 3600 });
  await expect
    .poll(async () => (await stripe<{ status: string }>("GET", `test_helpers/test_clocks/${clock.id}`)).status, { timeout: 120_000, intervals: [3000] })
    .toBe("ready");

  await expect.poll(async () => (await subscriptionOf(profileId!)).status, { timeout: 90_000 }).toBe("PAST_DUE");
  const notice = await prisma.notification.findFirst({ where: { userId: user.id, type: "SUBSCRIPTION_PAYMENT_FAILED" } });
  expect(notice).not.toBeNull();
  const subscription = await stripe<{ status: string }>("GET", `subscriptions/${row.stripeSubscriptionId}`);
  expect(subscription.status).toBe("past_due");

  await page.goto("/dashboard/abbonamento");
  await expect(page.getByText(/pagamento non riuscito/)).toBeVisible();
  await stripe("DELETE", `test_helpers/test_clocks/${clock.id}`).catch(() => undefined);
});
