import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
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

/**
 * Browser aperti da ogni prova (con la pagina di Stripe, captcha compreso):
 * si chiudono alla fine della prova invece di restare attivi fino alla fine
 * del giro e rallentare le prove successive.
 */
const openContexts: BrowserContext[] = [];
test.afterEach(async () => {
  await Promise.all(openContexts.splice(0).map((context) => context.close().catch(() => undefined)));
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
  openContexts.push(context);
  return context.newPage();
}

/**
 * Tornando da Stripe al sito il browser di prova (Chrome senza finestra della
 * CI) a volte apre il nostro sito in una scheda larga e alta 0 che non disegna
 * nulla: la pagina c'è tutta, con il messaggio giusto, ma ogni testo risulta
 * "non visibile". La registrazione del 05/11 lo mostra al ritorno dal link
 * "indietro" di Stripe, due tentativi su due; rimettere le misure con
 * setViewportSize non basta (la scheda resta 0x0). Non è una pagina del sito:
 * un browser vero ha sempre una finestra. Allora si apre lo stesso indirizzo
 * in una scheda nuova, con lo stesso accesso, e lì si fanno gli stessi
 * controlli; la prova lo annota nel resoconto, così si vede quante volte
 * capita.
 */
async function pageWithScreen(page: Page): Promise<Page> {
  const width = () => page.evaluate(() => window.innerWidth).catch(() => 0);
  const ok = await expect
    .poll(width, { timeout: 5_000 })
    .toBeGreaterThan(0)
    .then(() => true)
    .catch(() => false);
  if (ok) return page;
  test.info().annotations.push({ type: "browser", description: `scheda 0x0 al ritorno su ${page.url()}: riaperta` });
  const fresh = await page.context().newPage();
  await fresh.goto(page.url());
  await expect.poll(() => fresh.evaluate(() => window.innerWidth)).toBeGreaterThan(0);
  return fresh;
}

/** Ritorno da Stripe sul sito (`url`), con la scheda controllata come sopra. */
async function backOnSite(page: Page, url: RegExp): Promise<Page> {
  await page.waitForURL(url, { timeout: 90_000 });
  return pageWithScreen(page);
}

/**
 * La pagina di Stripe è pronta quando mostra il modulo della carta (o la voce
 * "Carta" da aprire). Prima Stripe sta ancora caricando i suoi riquadri.
 */
async function waitCheckoutReady(page: Page) {
  const cardNumber = page.locator("#cardNumber");
  const payWithCard = page.getByTestId("card-accordion-item-button");
  await expect.poll(async () => (await cardNumber.isVisible()) || (await payWithCard.count()) > 0, { timeout: 30_000 }).toBe(true);
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
  await waitCheckoutReady(page);
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

/**
 * Pulsante della finestra di prova del 3D Secure, in uno degli iframe di
 * Stripe. Un clic che arriva mentre la pagina della banca finisce di caricarsi
 * va perso (visto nella CI): si riclicca finché il pulsante non sparisce.
 */
async function complete3DSecure(page: Page) {
  let clicked = false;
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          const button = frame.locator("#test-source-authorize-3ds");
          if (await button.isVisible().catch(() => false)) {
            await button.click({ timeout: 5_000 }).catch(() => undefined);
            clicked = true;
            return false;
          }
        }
        return clicked;
      },
      { timeout: 60_000, intervals: [1_000, 2_000, 3_000] },
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
  const site = await backOnSite(page, /\/dashboard\/abbonamento\?attivato=carta/);
  await expect(site.getByText(/Fatto: carta salvata e mesi gratis attivi/)).toBeVisible();

  const after = await waitForCard(profile.id);
  expect(after.stripeSubscriptionId).toMatch(/^sub_/);
  // Stripe tiene la fine al secondo: il database prende la sua.
  expect(Math.abs(after.trialEndsAt!.getTime() - before.trialEndsAt!.getTime())).toBeLessThan(1000);
  await expectTrialOnStripe(after.stripeSubscriptionId!, after.trialEndsAt!);
});

test("carta con 3D Secure (3155): dopo la conferma della banca è come la 4242", async ({ browser }) => {
  const { user, profileId } = await newProfessional({ withProfile: true });
  const page = await signedIn(browser, user.id);
  await openCheckout(page);
  await fillCard(page, "4000002500003155");
  await complete3DSecure(page);
  const site = await backOnSite(page, /\/dashboard\/abbonamento\?attivato=carta/);
  await expect(site.getByText(/Fatto: carta salvata e mesi gratis attivi/)).toBeVisible();
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
  // Come una persona: si torna indietro con la pagina di Stripe già pronta.
  await waitCheckoutReady(page);
  // Il link "indietro" di Stripe porta al cancel_url.
  const back = page.locator('a[href*="annullato=1"]').first();
  const href = new URL((await back.getAttribute("href"))!);
  expect(`${href.origin}${href.pathname}${href.search}`).toBe(`${new URL(WEB_URL).origin}/dashboard/abbonamento?annullato=1`);
  await back.click();
  const site = await backOnSite(page, /\/dashboard\/abbonamento\?annullato=1/);
  await expect(site.getByText(/Non hai finito di aggiungere la carta/)).toBeVisible();
  await expect(site.getByRole("button", { name: "Attiva i mesi gratis" })).toBeVisible();
  const row = await subscriptionOf(profileId!);
  expect(row.stripeSubscriptionId).toBeNull();
  expect(row.cardAddedAt).toBeNull();
});

test("primo addebito fallito dopo i mesi gratis (0341, test clock): abbonamento non pagato e avviso", async ({ browser }) => {
  const clock = await stripe<{ id: string }>("POST", "test_helpers/test_clocks", { frozen_time: Math.floor(Date.now() / 1000), name: "carta 0341" });
  const { user, profileId } = await newProfessional({ withProfile: true });
  // Cliente Stripe sul test clock con l'email, come quello che crea il sito (ensureCustomer).
  const customer = await stripe<{ id: string }>("POST", "customers", { test_clock: clock.id, name: "Neri Impianti (prova)", email: user.email! });
  await prisma.professionalProfile.update({ where: { id: profileId! }, data: { stripeCustomerId: customer.id } });
  const page = await signedIn(browser, user.id);
  await openCheckout(page);
  await fillCard(page, "4000000000000341");
  const site = await backOnSite(page, /\/dashboard\/abbonamento\?attivato=carta/);
  await expect(site.getByText(/Fatto: carta salvata e mesi gratis attivi/)).toBeVisible();
  const row = await waitForCard(profileId!);

  // Tre mesi dopo, più il tempo in cui Stripe tiene la fattura in bozza.
  // Stripe fa avanzare il test clock al massimo di due mesi per volta.
  const target = Math.floor(row.trialEndsAt!.getTime() / 1000) + 2 * 3600;
  let frozen = Math.floor(Date.now() / 1000);
  while (frozen < target) {
    frozen = Math.min(target, frozen + 55 * 24 * 3600);
    await stripe("POST", `test_helpers/test_clocks/${clock.id}/advance`, { frozen_time: frozen });
    await expect
      .poll(async () => (await stripe<{ status: string }>("GET", `test_helpers/test_clocks/${clock.id}`)).status, { timeout: 120_000, intervals: [3000] })
      .toBe("ready");
  }

  await expect.poll(async () => (await subscriptionOf(profileId!)).status, { timeout: 90_000 }).toBe("PAST_DUE");
  // Lo stato arriva anche da customer.subscription.updated, che Stripe può
  // mandare prima di invoice.payment_failed (quello che crea l'avviso): si
  // aspetta l'avviso, non solo lo stato.
  await expect
    .poll(async () => prisma.notification.count({ where: { userId: user.id, type: "SUBSCRIPTION_PAYMENT_FAILED" } }), { timeout: 60_000 })
    .toBeGreaterThan(0);
  const subscription = await stripe<{ status: string }>("GET", `subscriptions/${row.stripeSubscriptionId}`);
  expect(subscription.status).toBe("past_due");

  await site.goto("/dashboard/abbonamento");
  await expect(site.getByText(/pagamento non riuscito/)).toBeVisible();
  await stripe("DELETE", `test_helpers/test_clocks/${clock.id}`).catch(() => undefined);
});
