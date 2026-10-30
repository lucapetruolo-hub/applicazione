import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { API_URL, WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";

/**
 * Persone in Admin (docs/changelog/2026-10-30-admin-persone.md): ricerca con
 * nome e cognome, account chiuso ritrovato con l'email esatta, recensione
 * nascosta con il motivo e rimessa visibile, profilo tolto dalla ricerca
 * senza sospendere l'account, segnali da controllare e "Account sospetti".
 */
const prisma = new PrismaClient();
const stamp = Date.now();
const ids = { admin: "", client: "", twin: "", pro: "", profile: "", review: "" };
const closedEmail = `chiuso-${stamp}@test.it`;
const phone = `+39 345 ${String(stamp).slice(-7)}`;

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia" && testInfo.project.name !== "computer-tokyo", "Un giro su telefono e uno su computer.");
});

test.beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const user = (data: { role: "CLIENT" | "PROFESSIONAL" | "ADMIN"; key: string; name: string; surname: string; phone?: string }) =>
    prisma.user.create({
      data: {
        role: data.role,
        email: `${data.key}-${stamp}@test.it`,
        name: data.name,
        surname: data.surname,
        phone: data.phone,
        emailVerifiedAt: new Date(),
        legalConsentAt: new Date(),
        ...(data.role === "ADMIN" ? { adminRoles: ["SUPER"], adminTotpEnabledAt: new Date(Date.now() - 60_000) } : {}),
      },
    });
  ids.admin = (await user({ role: "ADMIN", key: "admin-persone", name: "Admin", surname: "Persone" })).id;
  // Due clienti con lo stesso telefono (uno sull'account, l'altro nella richiesta): segnale su tutti e due.
  const client = await user({ role: "CLIENT", key: "vera", name: "Vera", surname: `Russo${stamp}`, phone });
  ids.client = client.id;
  const twin = await user({ role: "CLIENT", key: "gemella", name: "Gina", surname: `Russo${stamp}` });
  ids.twin = twin.id;
  await prisma.guidedRequest.create({
    data: { clientId: twin.id, categoryId: category.id, description: "Rubinetto che gocciola.", city: "Latina", recipientPhone: phone.replace(/\s/g, "") },
  });

  const pro = await user({ role: "PROFESSIONAL", key: "pro-persone", name: "Ugo", surname: "Tubi" });
  ids.pro = pro.id;
  const profile = await prisma.professionalProfile.create({
    data: { userId: pro.id, categoryId: category.id, businessName: `Idraulica Tubi ${stamp}`, city: "Latina", latitude: 41.4677, longitude: 12.9036 },
  });
  ids.profile = profile.id;
  const request = await prisma.guidedRequest.create({ data: { clientId: client.id, categoryId: category.id, description: "Scarico intasato.", city: "Latina", status: "CLOSED" } });
  const quote = await prisma.quote.create({
    data: { guidedRequestId: request.id, professionalProfileId: profile.id, estimatedStartDate: new Date("2026-09-01T09:00:00Z"), status: "ACCEPTED" },
  });
  const booking = await prisma.booking.create({
    data: { quoteId: quote.id, clientId: client.id, professionalProfileId: profile.id, scheduledAt: new Date("2026-09-01T09:00:00Z"), status: "COMPLETED", serviceMode: "HOME" },
  });
  // Scritta subito dopo l'iscrizione: segnale "recensione scritta poco dopo l'iscrizione".
  ids.review = (await prisma.review.create({ data: { bookingId: booking.id, rating: 5, comment: `Bravissimo ${stamp}` } })).id;

  // Account chiuso: l'email non c'è più, resta l'impronta (la mette il server alla chiusura).
  const closed = await user({ role: "CLIENT", key: "da-chiudere", name: "Carlo", surname: "Chiuso" });
  await prisma.user.update({ where: { id: closed.id }, data: { email: closedEmail } });
  const res = await fetch(`${API_URL}/auth/me`, { method: "DELETE", headers: { Authorization: `Bearer ${testToken(closed.id)}`, "Content-Type": "application/json" }, body: "{}" });
  expect(res.ok).toBe(true);
});

test.afterAll(() => prisma.$disconnect());

async function adminPage(browser: Browser, isMobile: boolean) {
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
            { name: "professionisti_token", value: testToken(ids.admin, { amfa: Math.floor(Date.now() / 1000) }) },
          ],
        },
      ],
    },
  });
  return { context, page: await context.newPage() };
}

test("Persone: ricerca, account chiuso, recensione nascosta e rimessa, profilo fuori dalla ricerca, segnali", async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  const isMobile = testInfo.project.name === "telefono-italia";
  const { context, page } = await adminPage(browser, isMobile);
  const search = page.getByRole("textbox", { name: "Cerca utenti" });
  const rows = page.locator("table.admin-table tbody tr");

  // Nome e cognome insieme.
  await page.goto("/admin/utenti");
  await search.fill(`Vera Russo${stamp}`);
  await expect(rows.filter({ hasText: `Vera Russo${stamp}` })).toHaveCount(1);

  // Account chiuso con l'email esatta: si trova, senza mostrare l'email.
  await search.fill(closedEmail.toUpperCase());
  await expect(rows.filter({ hasText: "Account chiuso" })).toHaveCount(1);
  await expect(page.getByText(closedEmail)).toHaveCount(0);

  // Scheda di Vera: segnali in cima, gemella apribile.
  await page.goto(`/admin/utenti/${ids.client}`);
  const signals = page.getByRole("region", { name: "Da controllare" });
  await expect(signals.getByText("Stesso telefono di un altro account")).toBeVisible();
  await expect(signals.getByText("Recensione scritta poco dopo l'iscrizione")).toBeVisible();
  await expect(signals.getByRole("link", { name: `Gina Russo${stamp}` })).toBeVisible();

  // Lavori con lo stato in italiano.
  await page.getByRole("button", { name: /^Lavori/ }).click();
  await expect(page).toHaveURL(/scheda=lavori/);
  await expect(page.getByRole("cell", { name: "Terminato" })).toBeVisible();

  // Nascondi la recensione: motivo, regola e spiegazione obbligatori.
  await page.getByRole("button", { name: /^Recensioni/ }).click();
  const reviewRow = rows.filter({ hasText: `Bravissimo ${stamp}` });
  await reviewRow.getByRole("button", { name: "Nascondi" }).click();
  const dialog = page.getByRole("dialog", { name: "Nascondi la recensione" });
  await dialog.getByRole("button", { name: "Nascondi la recensione" }).click();
  await expect(dialog.getByText("Scegli il motivo.")).toBeVisible();
  await dialog.getByLabel("Motivo").selectOption("recensione-falsa-truffa");
  await dialog.getByLabel("Regola o legge violata").selectOption("legge-recensione-falsa");
  await dialog.getByRole("button", { name: "Recensione non genuina" }).click();
  await dialog.getByRole("button", { name: "Nascondi la recensione" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(reviewRow.getByText(/Nascosta dal/)).toBeVisible();
  await expect(reviewRow.getByText(/Motivo: La recensione non descrive/)).toBeVisible();
  expect((await prisma.review.findUniqueOrThrow({ where: { id: ids.review } })).hiddenAt).not.toBeNull();
  // È passata dalle segnalazioni: una segnalazione accolta, con la regola.
  const report = await prisma.contentReport.findFirstOrThrow({ where: { targetId: ids.review }, orderBy: { createdAt: "desc" } });
  expect(report).toMatchObject({ status: "RESOLVED", action: "HIDE_CONTENT", ground: "legge-recensione-falsa", reporterId: ids.admin });

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  // Rimetti visibile: annulla la stessa decisione.
  await reviewRow.getByRole("button", { name: "Rimetti visibile" }).click();
  const revert = page.getByRole("dialog", { name: "Rimetti visibile la recensione" });
  await revert.getByLabel("Motivo").fill("Ricorso accolto: il lavoro c'è stato.");
  await revert.getByRole("button", { name: "Rimetti visibile la recensione" }).click();
  await expect(reviewRow.getByText("Visibile", { exact: true })).toBeVisible();
  expect((await prisma.review.findUniqueOrThrow({ where: { id: ids.review } })).hiddenAt).toBeNull();

  // Profilo del professionista: fuori dalla ricerca senza sospendere l'account.
  await page.goto(`/admin/utenti/${ids.pro}`);
  await page.getByRole("button", { name: "Togli dalla ricerca" }).click();
  const hide = page.getByRole("dialog", { name: "Togli dalla ricerca" });
  await hide.getByLabel("Motivo").selectOption("informazioni-false");
  await hide.getByLabel("Regola o legge violata").selectOption("termini-profilo");
  await hide.getByLabel("Spiegazione per l'autore").fill("Il profilo dice di avere un'esperienza che non risulta.");
  await hide.getByRole("button", { name: "Togli dalla ricerca" }).click();
  await expect(page.getByText("Tolto dalla ricerca").first()).toBeVisible();
  await expect(page.getByText("Attivo", { exact: true })).toHaveCount(0);
  const proUser = await prisma.user.findUniqueOrThrow({ where: { id: ids.pro }, include: { professionalProfile: true } });
  expect(proUser.suspendedAt).toBeNull();
  expect(proUser.professionalProfile?.suspendedAt).not.toBeNull();
  await page.getByRole("button", { name: "Rimetti nella ricerca" }).click();
  const show = page.getByRole("dialog", { name: "Rimetti nella ricerca" });
  await show.getByLabel("Motivo").fill("Ha corretto il profilo.");
  await show.getByRole("button", { name: "Rimetti nella ricerca" }).click();
  await expect(page.getByText("Nella ricerca").first()).toBeVisible();

  // Account sospetti: Vera e la gemella con lo stesso telefono.
  await page.goto("/admin/account-sospetti");
  await expect(page.getByRole("heading", { name: "Account sospetti" })).toBeVisible();
  await expect(page.getByRole("link", { name: `Vera Russo${stamp}` })).toBeVisible();
  await expect(page.getByRole("link", { name: `Gina Russo${stamp}` })).toBeVisible();

  await context.close();
});

test("I-08: \"pagamento=completato\" sulla richiesta di un altro non dice niente", async ({ browser }, testInfo) => {
  const isMobile = testInfo.project.name === "telefono-italia";
  const other = await prisma.guidedRequest.findFirstOrThrow({ where: { clientId: ids.twin } });
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    viewport: isMobile ? { width: 390, height: 844 } : { width: 1280, height: 900 },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: WEB_URL,
          localStorage: [
            { name: "cookie-consent-v1", value: "denied" },
            { name: "professionisti_token", value: testToken(ids.client) },
          ],
        },
      ],
    },
  });
  const page = await context.newPage();
  await page.goto(`/le-mie-richieste?open=${other.id}&pagamento=completato`);
  await expect(page.getByRole("heading", { name: "Le mie richieste" }).or(page.getByText("Le mie richieste").first())).toBeVisible();
  await expect(page.getByText(/Pagamento ricevuto|Stiamo controllando il pagamento/)).toHaveCount(0);
  await context.close();
});
