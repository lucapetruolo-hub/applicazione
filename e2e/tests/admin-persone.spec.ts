import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { API_URL, WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";

/**
 * Persone in Admin (docs/changelog/2026-10-30-admin-persone.md): ricerca con
 * nome e cognome, account chiuso ritrovato con l'email esatta, recensione
 * nascosta con il motivo e rimessa visibile, profilo tolto dalla ricerca
 * senza sospendere l'account, segnali da controllare e "Account sospetti"
 * con cosa fare in cima e "Controlla ora".
 */
const prisma = new PrismaClient();
const stamp = Date.now();
const ids = { admin: "", client: "", twin: "", pro: "", profile: "", review: "", chatPro: "" };
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
  const twinRequest = await prisma.guidedRequest.create({
    data: { clientId: twin.id, categoryId: category.id, description: "Rubinetto che gocciola.", city: "Latina", recipientPhone: phone.replace(/\s/g, "") },
  });

  // Lo stesso telefono anche sul professionista, scritto senza prefisso (il telefono è unico per account):
  // la recensione di Vera è tra due account con gli stessi dati.
  const pro = await user({ role: "PROFESSIONAL", key: "pro-persone", name: "Ugo", surname: "Tubi", phone: phone.replace("+39 ", "").replace(/\s/g, "") });
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

  // Un altro professionista scrive il suo numero in chat prima che Gina accetti: "Da guardare".
  // Gina risponde "scrivimi su WhatsApp": per il cliente nessuna azione.
  const chatPro = await user({ role: "PROFESSIONAL", key: "pro-chat", name: "Leo", surname: "Fili" });
  const chatProfile = await prisma.professionalProfile.create({
    data: { userId: chatPro.id, categoryId: category.id, businessName: `Elettrica Fili ${stamp}`, city: "Latina", latitude: 41.4677, longitude: 12.9036 },
  });
  ids.chatPro = chatPro.id;
  await prisma.conversationEvent.createMany({
    data: [
      { guidedRequestId: twinRequest.id, professionalProfileId: chatProfile.id, actor: "PROFESSIONAL", message: "Mi chiami pure al 347 555 1234 così ci accordiamo." },
      { guidedRequestId: twinRequest.id, professionalProfileId: chatProfile.id, actor: "CLIENT", message: "Va bene, ci sentiamo su WhatsApp." },
      // Un messaggio automatico non conta mai.
      { guidedRequestId: twinRequest.id, professionalProfileId: chatProfile.id, actor: "SYSTEM", message: "Preventivo inviato: 347 555 1234", automatic: true },
    ],
  });

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
  test.setTimeout(150_000);
  const isMobile = testInfo.project.name === "telefono-italia";
  const { context, page } = await adminPage(browser, isMobile);
  const search = page.getByRole("textbox", { name: "Cerca utenti" });
  const rows = page.locator("table.admin-table tbody tr");

  // Account sospetti: "Controlla ora" e, in cima, cosa fare senza aprire le schede.
  await page.goto("/admin/account-sospetti");
  await expect(page.getByRole("heading", { name: "Account sospetti" })).toBeVisible();
  await page.getByRole("button", { name: "Controlla ora" }).click();
  await expect(page.getByText(/Ultimo controllo:/)).toBeVisible();
  const todo = page.getByRole("region", { name: "Cosa fare" });
  // Per persona: anche il consiglio sul professionista nomina Vera.
  const veraTodo = todo.getByRole("listitem").filter({ has: page.getByRole("link", { name: `Vera Russo${stamp}` }) });
  await expect(veraTodo.getByText("Da fare subito")).toBeVisible();
  await expect(veraTodo.getByText(`Nascondi la sua recensione a Idraulica Tubi ${stamp}`)).toBeVisible();
  await expect(todo.getByRole("link", { name: `Idraulica Tubi ${stamp}` })).toBeVisible();
  // Contatti in chat prima dell'accettazione: il professionista è da guardare, con chi e quanti messaggi.
  const chatTodo = todo.getByRole("listitem").filter({ has: page.getByRole("link", { name: `Elettrica Fili ${stamp}` }) });
  await expect(chatTodo.getByText("Da guardare")).toBeVisible();
  await expect(chatTodo.getByText(/Ha scritto telefono, email o link in chat prima che il cliente accettasse/)).toBeVisible();
  await expect(chatTodo.getByText(`1 messaggio con Gina Russo${stamp}`, { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const axeTodo = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(axeTodo.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  // Gina ha lo stesso telefono di un cliente e del professionista e ha scritto "WhatsApp": nessuna azione, nella sua scheda.
  await expect(todo.getByRole("link", { name: `Gina Russo${stamp}` })).toHaveCount(0);
  await page.getByRole("button", { name: /^Nessuna azione \(/ }).click();
  await expect(page).toHaveURL(/vista=nessuna-azione/);
  await expect(rows.filter({ hasText: `Gina Russo${stamp}` }).getByText("Nessuna azione", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /^Da gestire \(/ }).click();
  // Il link porta dritto alla scheda giusta.
  await veraTodo.getByRole("link", { name: `Vera Russo${stamp}` }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/utenti/${ids.client}\\?scheda=recensioni`));
  await expect(rows.filter({ hasText: `Bravissimo ${stamp}` })).toBeVisible();

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
  await expect(signals.getByText(`Nascondi la sua recensione a Idraulica Tubi ${stamp}`)).toBeVisible();

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
  // Stato del profilo e pulsante giusto, non una scritta qualunque della pagina
  // (docs/changelog/2026-11-10-prove-che-falliscono-in-locale.md).
  await expect(hide).toHaveCount(0);
  // Lo stato cambia in tutti e due i punti: in testa alla scheda e nel riquadro del profilo.
  await expect(page.getByText("Tolto dalla ricerca", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/^Tolto dalla ricerca il .*Motivo: Il profilo dice di avere un'esperienza che non risulta\.$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Rimetti nella ricerca" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Togli dalla ricerca" })).toHaveCount(0);
  await expect(page.getByText("Attivo", { exact: true })).toHaveCount(0);
  const proUser = await prisma.user.findUniqueOrThrow({ where: { id: ids.pro }, include: { professionalProfile: true } });
  expect(proUser.suspendedAt).toBeNull();
  expect(proUser.professionalProfile?.suspendedAt).not.toBeNull();
  await page.getByRole("button", { name: "Rimetti nella ricerca" }).click();
  const show = page.getByRole("dialog", { name: "Rimetti nella ricerca" });
  await show.getByLabel("Motivo").fill("Ha corretto il profilo.");
  await show.getByRole("button", { name: "Rimetti nella ricerca" }).click();
  await expect(show).toHaveCount(0);
  // In testa alla scheda torna "Attivo", nel riquadro del profilo "Nella ricerca".
  await expect(page.getByText("Attivo", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Nella ricerca", { exact: true })).toHaveCount(1);
  await expect(page.getByText("Tolto dalla ricerca", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/^Tolto dalla ricerca il /)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Togli dalla ricerca" })).toBeVisible();
  // Una misura presa archivia il caso da sola, come "Gestito".
  await prisma.professionalProfile.update({ where: { userId: ids.pro }, data: { suspendedAt: new Date() } });
  // La lista chiesta all'apertura arriva apposta dopo "Controlla ora": non deve
  // coprirne il risultato (docs/changelog/2026-11-10-prove-che-falliscono-in-locale.md).
  await page.route(/\/admin\/suspicious-users$/, async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await route.fulfill({ response });
  });
  await page.goto("/admin/account-sospetti?vista=archiviati");
  await page.getByRole("button", { name: "Controlla ora" }).click();
  await expect(rows.filter({ hasText: `Idraulica Tubi ${stamp}` }).getByText("Gestito: profilo tolto dalla ricerca", { exact: true })).toBeVisible();
  await expect.poll(async () => (await prisma.suspiciousAccount.findUniqueOrThrow({ where: { userId: ids.pro } })).archiveReason).toBe("PROFILE_HIDDEN");
  // Arrivata anche la lista di prima, il risultato del controllo resta.
  await page.unrouteAll({ behavior: "wait" });
  await expect(rows.filter({ hasText: `Idraulica Tubi ${stamp}` }).getByText("Gestito: profilo tolto dalla ricerca", { exact: true })).toBeVisible();
  await prisma.professionalProfile.update({ where: { userId: ids.pro }, data: { suspendedAt: null } });

  // Gli account da fare sono anche nella coda "Da fare" della Home.
  await page.goto("/admin");
  await expect(page.getByText(`Account sospetto: Vera Russo${stamp}`)).toBeVisible();

  // "Prendo io" sul caso: con "Va bene così" si toglie da solo.
  const veraQueueRow = page.locator("table.admin-queue tbody tr").filter({ hasText: `Account sospetto: Vera Russo${stamp}` });
  await veraQueueRow.getByRole("button", { name: "Prendo io" }).click();
  await expect(veraQueueRow.getByText("Preso da te")).toBeVisible();

  // "Va bene così": motivo obbligatorio, esce da "Cosa fare" e dalla Home, va negli archiviati.
  await page.goto("/admin/account-sospetti");
  const veraItem = page.getByRole("region", { name: "Cosa fare" }).getByRole("listitem").filter({ has: page.getByRole("link", { name: `Vera Russo${stamp}` }) });
  await veraItem.getByRole("button", { name: `Va bene così: Vera Russo${stamp}` }).click();
  const okDialog = page.getByRole("dialog", { name: "Va bene così" });
  await okDialog.getByRole("button", { name: "Va bene così" }).click();
  await expect(okDialog.getByText(/almeno 10 caratteri/)).toBeVisible();
  await okDialog.getByLabel("Perché va bene").fill("Prova automatica: controllato a mano, nessun problema.");
  await okDialog.getByRole("button", { name: "Va bene così" }).click();
  await expect(okDialog).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Cosa fare" }).getByRole("link", { name: `Vera Russo${stamp}` })).toHaveCount(0);
  await page.getByRole("button", { name: /^Archiviati \(/ }).click();
  await page.getByRole("searchbox", { name: "Cerca negli archiviati" }).fill("controllato a mano");
  await expect(rows.filter({ hasText: `Vera Russo${stamp}` }).getByText("Va bene così", { exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Cerca negli archiviati" }).fill("parola che non c'è");
  await expect(rows.filter({ hasText: `Vera Russo${stamp}` })).toHaveCount(0);
  expect((await prisma.suspiciousAccount.findUniqueOrThrow({ where: { userId: ids.client } })).archiveReason).toBe("OK");
  expect(await prisma.adminCaseClaim.count({ where: { caseKey: `SUSPICIOUS_ACCOUNT:${ids.client}` } })).toBe(0);
  await page.goto("/admin");
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByText(`Account sospetto: Vera Russo${stamp}`)).toHaveCount(0);
  // Dalla scheda si riapre, e torna da fare.
  await page.goto(`/admin/utenti/${ids.client}`);
  await expect(page.getByText(/Prova automatica: controllato a mano/)).toBeVisible();
  await page.getByRole("button", { name: "Riapri" }).click();
  await expect(page.getByRole("button", { name: "Va bene così" })).toBeVisible();
  expect((await prisma.suspiciousAccount.findUniqueOrThrow({ where: { userId: ids.client } })).archiveReason).toBeNull();

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
  // Il titolo della pagina, non la voce del menu con la stessa scritta.
  await expect(page.getByRole("heading", { level: 1, name: "Le mie richieste", exact: true })).toBeVisible();
  await expect(page.getByText(/Pagamento ricevuto|Stiamo controllando il pagamento/)).toHaveCount(0);
  await context.close();
});
