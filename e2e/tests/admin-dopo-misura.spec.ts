import { expect, test, type Browser } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";

/**
 * Correzioni dopo la misura "dopo" del riordino dell'Admin
 * (docs/changelog/2026-11-03-admin-dopo-la-misura.md): il ricorso su un
 * problema chiede conferma, la persona compare accanto all'attività, "Ce ne
 * occupiamo noi" mostra il pericolo e "Prendo io", la scheda di un profilo
 * tolto dalla ricerca dice in che stato è.
 */
const prisma = new PrismaClient();
const stamp = Date.now();
const ids = { admin: "", other: "", client: "", pro: "", profile: "", issue: "", takeover: "", hidden: "", hiddenProfile: "" };

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia" && testInfo.project.name !== "computer-tokyo", "Un giro su telefono e uno su computer.");
});

test.beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "elettricista" } });
  const user = (data: { role: "CLIENT" | "PROFESSIONAL" | "ADMIN"; key: string; name: string; surname: string }) =>
    prisma.user.create({
      data: {
        role: data.role,
        email: `${data.key}-${stamp}@test.it`,
        name: data.name,
        surname: data.surname,
        emailVerifiedAt: new Date(),
        legalConsentAt: new Date(),
        ...(data.role === "ADMIN" ? { adminRoles: ["SUPER"], adminTotpEnabledAt: new Date(Date.now() - 60_000) } : {}),
      },
    });
  ids.admin = (await user({ role: "ADMIN", key: "admin-dopo", name: "Admin", surname: "Dopo" })).id;
  ids.other = (await user({ role: "ADMIN", key: "admin-altro", name: "Admin", surname: "Altro" })).id;
  ids.client = (await user({ role: "CLIENT", key: "ugo-dopo", name: "Ugo", surname: `Conti${stamp}` })).id;
  ids.pro = (await user({ role: "PROFESSIONAL", key: "luigi-dopo", name: "Luigi", surname: `Bianchi${stamp}` })).id;
  ids.profile = (
    await prisma.professionalProfile.create({
      data: { userId: ids.pro, categoryId: category.id, businessName: `Impianti Elettrici ${stamp}`, city: "Latina", latitude: 41.4677, longitude: 12.9036 },
    })
  ).id;
  const booking = await prisma.booking.create({
    data: { clientId: ids.client, professionalProfileId: ids.profile, scheduledAt: new Date(Date.now() - 5 * 24 * 3600_000), status: "COMPLETED" },
  });
  // Problema accolto da un altro admin, con il ricorso del professionista.
  ids.issue = (
    await prisma.jobIssue.create({
      data: {
        bookingId: booking.id,
        type: "BAD_WORK",
        description: "Salta la corrente quando accendo la stufa.",
        status: "UPHELD",
        resolvedAt: new Date(Date.now() - 2 * 24 * 3600_000),
        resolvedByUserId: ids.other,
        resolutionNote: "Impianto non a norma secondo le foto.",
        appealText: `Il cliente ha collegato una stufa da 3 kW ${stamp}.`,
        appealedAt: new Date(Date.now() - 24 * 3600_000),
      },
    })
  ).id;
  ids.takeover = (await prisma.problemTakeover.create({ data: { userId: ids.client, description: `Sento odore di gas in cucina ${stamp}`, city: "Latina" } })).id;

  // Profilo tolto dalla ricerca con una segnalazione accolta.
  ids.hidden = (await user({ role: "PROFESSIONAL", key: "doppio-dopo", name: "Marco", surname: `Doppio${stamp}` })).id;
  ids.hiddenProfile = (
    await prisma.professionalProfile.create({
      data: { userId: ids.hidden, categoryId: category.id, businessName: `Profilo Doppio ${stamp}`, city: "Latina", latitude: 41.4677, longitude: 12.9036, suspendedAt: new Date() },
    })
  ).id;
  await prisma.contentReport.create({
    data: {
      reporterId: ids.client,
      targetType: "PROFESSIONAL_PROFILE",
      targetId: ids.hiddenProfile,
      reason: "Profilo falso o copiato",
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolutionNote: "Profilo copiato da un altro professionista.",
      action: "SUSPEND_PROFILE",
      ground: "TERMS",
      contentOwnerId: ids.hidden,
    },
  });
});

test.afterAll(async () => {
  await prisma.contactMessage.deleteMany({ where: { content: { contains: String(stamp) } } });
  await prisma.adminCaseClaim.deleteMany({ where: { caseKey: `PROBLEM_TAKEOVER:${ids.takeover}` } });
  await prisma.problemTakeover.deleteMany({ where: { id: ids.takeover } });
  await prisma.$disconnect();
});

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

test("Ricorso su un problema: chiede conferma e mostra la persona accanto all'attività", async ({ browser, isMobile }) => {
  // Ogni giro riparte con il ricorso da decidere.
  await prisma.jobIssue.update({ where: { id: ids.issue }, data: { status: "UPHELD", appealDecision: null, appealNote: null, appealResolvedAt: null, appealResolvedByUserId: null } });
  const { context, page } = await adminPage(browser, isMobile);
  await page.goto(`/admin/problemi?vista=appeals`);
  const searchbox = page.getByRole("searchbox", { name: "Cerca nelle segnalazioni" });
  await searchbox.fill(String(stamp));
  // Prima si aspettano i risultati della ricerca: la lista di prima resta in
  // vista mentre si cerca e, con un solo ricorso aperto, le righe sono le stesse
  // (docs/changelog/2026-11-10-prove-che-falliscono-in-locale.md).
  await expect(page.getByText("Risultati in tutte le schede, aperte e chiuse.")).toBeVisible();
  await expect(page.getByRole("link", { name: `Impianti Elettrici ${stamp} · Luigi Bianchi${stamp}` })).toBeVisible();
  // Dopo la ricerca resta solo questo ricorso.
  await expect(page.getByText(/la sua risposta è nella richiesta di rivedere la decisione/)).toHaveCount(1);

  const note = page.getByRole("textbox", { name: "Perché decidi così" });
  await note.fill("La stufa supera la potenza del contatore.");
  // Cambiando la ricerca la motivazione già scritta non si perde.
  const searched = page.waitForResponse((response) => response.url().includes(`q=${encodeURIComponent(`Impianti Elettrici ${stamp}`)}`));
  await searchbox.fill(`Impianti Elettrici ${stamp}`);
  await searched;
  await expect(page.getByText("Risultati in tutte le schede, aperte e chiuse.")).toBeVisible();
  await expect(note).toHaveValue("La stufa supera la potenza del contatore.");
  await page.getByRole("button", { name: "Ha ragione: annulla la decisione" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Annullare la decisione?")).toBeVisible();
  await dialog.getByRole("button", { name: "Torna indietro" }).click();
  // Tornando indietro non si decide nulla.
  expect((await prisma.jobIssue.findUniqueOrThrow({ where: { id: ids.issue } })).appealDecision).toBeNull();

  await page.getByRole("button", { name: "Ha ragione: annulla la decisione" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Annulla la decisione" }).click();
  await expect.poll(async () => (await prisma.jobIssue.findUniqueOrThrow({ where: { id: ids.issue } })).appealDecision).toBe("ACCEPTED");
  await context.close();
});

test("Problemi: dopo un caricamento fallito, la lista arrivata toglie l'errore", async ({ browser, isMobile }) => {
  await prisma.jobIssue.update({ where: { id: ids.issue }, data: { status: "UPHELD", appealDecision: null, appealNote: null, appealResolvedAt: null, appealResolvedByUserId: null } });
  const { context, page } = await adminPage(browser, isMobile);
  // Il primo caricamento fallisce (docs/changelog/2026-11-10-prove-che-falliscono-in-locale.md).
  await page.route(/\/admin\/job-issues\?view=open/, (route) => route.fulfill({ status: 500, json: { message: "Errore di prova del caricamento" } }), { times: 1 });
  await page.goto("/admin/problemi");
  await expect(page.getByText("Errore di prova del caricamento")).toBeVisible();
  await page.getByRole("button", { name: "Da rivedere" }).click();
  await expect(page.getByRole("link", { name: `Impianti Elettrici ${stamp} · Luigi Bianchi${stamp}` })).toBeVisible();
  await expect(page.getByText("Errore di prova del caricamento")).toHaveCount(0);
  await context.close();
});

test("Ce ne occupiamo noi: pericolo del gas e Prendo io anche nella pagina", async ({ browser, isMobile }) => {
  await prisma.adminCaseClaim.deleteMany({ where: { caseKey: `PROBLEM_TAKEOVER:${ids.takeover}` } });
  const { context, page } = await adminPage(browser, isMobile);
  await page.goto("/admin/richieste-da-seguire");
  const row = page.getByRole("row").filter({ hasText: `Sento odore di gas in cucina ${stamp}` });
  await expect(row.getByText("Possibile pericolo: gas")).toBeVisible();
  await row.getByRole("button", { name: "Prendo io" }).click();
  await expect(row.getByText("Preso da te")).toBeVisible();
  await row.getByRole("button", { name: "Lascia" }).click();
  await expect(row.getByRole("button", { name: "Prendo io" })).toBeVisible();
  await context.close();
});

test("Profilo tolto dalla ricerca: la scheda dice lo stato e offre solo Rimetti", async ({ browser, isMobile }) => {
  const { context, page } = await adminPage(browser, isMobile);
  await page.goto(`/admin/utenti/${ids.hidden}`);
  await expect(page.getByText(/^Tolto dalla ricerca il .*Motivo: Profilo copiato da un altro professionista\./)).toBeVisible();
  await expect(page.getByRole("button", { name: "Rimetti nella ricerca" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Togli dalla ricerca" })).toHaveCount(0);
  await context.close();
});

test("Messaggi dal sito: Annulla subito dopo Segna come gestito, Riapri dall'archivio", async ({ browser, isMobile }) => {
  const content = `Non riesco a cambiare la data ${stamp} ${isMobile ? "telefono" : "computer"}.`;
  const message = await prisma.contactMessage.create({ data: { role: "CLIENT", email: `giulia-${stamp}@prova.it`, content } });
  const { context, page } = await adminPage(browser, isMobile);
  await page.goto("/admin/messaggi");
  const card = (button: string) =>
    page
      .locator("div")
      .filter({ hasText: content })
      .filter({ has: page.getByRole("button", { name: button }) })
      .last();
  await card("Segna come gestito").getByRole("button", { name: "Segna come gestito" }).click();
  const status = page.getByRole("status").filter({ hasText: `giulia-${stamp}@prova.it` });
  await expect(status).toBeVisible();
  await expect.poll(async () => (await prisma.contactMessage.findUniqueOrThrow({ where: { id: message.id } })).resolved).toBe(true);
  await status.getByRole("button", { name: "Annulla" }).click();
  await expect.poll(async () => (await prisma.contactMessage.findUniqueOrThrow({ where: { id: message.id } })).resolved).toBe(false);
  await expect(card("Segna come gestito")).toBeVisible();

  // Dall'archivio si riapre in qualunque momento.
  await prisma.contactMessage.update({ where: { id: message.id }, data: { resolved: true } });
  await page.getByRole("tab", { name: "Archivio" }).or(page.getByRole("button", { name: "Archivio" })).first().click();
  await card("Riapri").getByRole("button", { name: "Riapri" }).click();
  await expect.poll(async () => (await prisma.contactMessage.findUniqueOrThrow({ where: { id: message.id } })).resolved).toBe(false);
  await context.close();
});
