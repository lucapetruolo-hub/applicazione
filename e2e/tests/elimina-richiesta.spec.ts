import { expect, test, type Browser, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@professionisti/database";
import { API_URL, WEB_URL } from "../fixtures/env";
import { testToken } from "../fixtures/preventivi";

/**
 * "Elimina richiesta" del cliente (docs/CHANGELOG.md §343): una sola voce,
 * dal modulo di modifica e dal menu a tre linee, conferma con motivo
 * facoltativo e poi "Richiesta eliminata · Annulla". La richiesta sparisce
 * per il cliente ma resta per i professionisti ("Ritirata dal cliente") e
 * per l'admin; uscire dal modulo con modifiche non salvate, anche col tasto
 * Indietro, chiede prima conferma.
 */
const PASSWORD = "Password123!";
const prisma = new PrismaClient();
let stamp = 0;
let categoryId = "";
let profileId = "";
let proEmail = "";
let adminId = "";

test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un telefono: il percorso non dipende dal fuso.");
  // Margine per l'attesa del limite sugli accessi (login).
  testInfo.setTimeout(180_000);
});

test.beforeAll(async () => {
  stamp = Date.now();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  categoryId = category.id;
  const pro = await prisma.user.create({
    data: { role: "PROFESSIONAL", email: `pro-elimina-${stamp}@test.it`, passwordHash, name: "Paolo", emailVerifiedAt: new Date(), legalConsentAt: new Date() },
  });
  const admin = await prisma.user.create({
    data: {
      role: "ADMIN",
      adminRoles: ["SUPER"],
      adminTotpEnabledAt: new Date(),
      email: `admin-elimina-${stamp}@test.it`,
      passwordHash,
      name: "Admin",
      emailVerifiedAt: new Date(),
      legalConsentAt: new Date(),
    },
  });
  const profile = await prisma.professionalProfile.create({
    data: { userId: pro.id, categoryId, businessName: "Paolo Idraulica", city: "Latina", latitude: 41.4677, longitude: 12.9036 },
  });
  profileId = profile.id;
  proEmail = `pro-elimina-${stamp}@test.it`;
  adminId = admin.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Un cliente con due richieste aperte inviate a Paolo (con due la pagina mostra l'elenco). */
async function clientWithRequests(key: string) {
  const email = `${key}-${stamp}@test.it`;
  const client = await prisma.user.create({
    data: { role: "CLIENT", email, passwordHash: await bcrypt.hash(PASSWORD, 10), name: "Carla", emailVerifiedAt: new Date(), legalConsentAt: new Date() },
  });
  const make = async (description: string) => {
    const request = await prisma.guidedRequest.create({
      data: { clientId: client.id, categoryId, description, city: "Latina", serviceMode: "ONLINE", professionalProfileId: profileId },
    });
    await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: profileId, priceEurCents: 0 } });
    return request.id;
  };
  const first = await make("Perdita sotto il lavello della cucina");
  const second = await make("Scaldabagno elettrico da sostituire");
  return { email, first, second };
}

async function login(email: string) {
  // L'accesso ha un limite di 10 al minuto per indirizzo: si aspetta e si riprova.
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    if (response.status === 429 && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, (Number(response.headers.get("retry-after")) || 20) * 1000 + 500));
      continue;
    }
    expect(response.ok, `Accesso di prova non riuscito: ${response.status}`).toBe(true);
    return ((await response.json()) as { token: string }).token;
  }
}

async function pageAs(browser: Browser, email: string) {
  const token = await login(email);
  const context = await browser.newContext({
    baseURL: WEB_URL,
    locale: "it-IT",
    viewport: { width: 412, height: 915 },
    isMobile: true,
    hasTouch: true,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: WEB_URL,
          localStorage: [
            { name: "cookie-consent-v1", value: "denied" },
            { name: "professionisti_token", value: token },
          ],
        },
      ],
    },
  });
  return context.newPage();
}

const card = (page: Page, text: string) => page.locator('[id^="request-"]', { hasText: text });

async function openEdit(page: Page, text: string) {
  const target = card(page, text);
  const edit = target.getByRole("button", { name: "Modifica", exact: true });
  // La scheda resta aperta dopo l'uscita dal modulo: la si apre solo se chiusa.
  if (!(await edit.isVisible())) await target.getByText(text).first().click();
  await edit.click();
  await expect(page.getByText("Torna alla richiesta")).toBeVisible();
  return target;
}

test("dal modulo di modifica: conferma con motivo, poi Annulla la riporta", async ({ browser }) => {
  const client = await clientWithRequests("cliente-modulo");
  const page = await pageAs(browser, client.email);
  await page.goto("/le-mie-richieste");
  const target = await openEdit(page, "lavello");

  await target.getByRole("button", { name: "Elimina richiesta" }).click();
  const dialog = page.getByRole("dialog", { name: "Eliminare la richiesta?" });
  await expect(dialog.getByText("I professionisti la vedranno come ritirata.")).toBeVisible();
  await dialog.getByRole("radio", { name: "Ho già trovato qualcuno" }).click();
  await dialog.getByRole("button", { name: "Elimina richiesta" }).click();

  await expect(page.getByText("Richiesta eliminata")).toBeVisible();
  await expect(card(page, "lavello")).toHaveCount(0);
  await expect(page.getByText("Torna alla richiesta")).toHaveCount(0);
  const deleted = await prisma.guidedRequest.findUniqueOrThrow({ where: { id: client.first } });
  expect(deleted.deletedByClientAt).not.toBeNull();
  expect(deleted.withdrawReason).toBe("FOUND_ELSEWHERE");
  expect(deleted.closedReason).toBe("CANCELED_BY_CLIENT");
  // Il professionista la vede ritirata, con una riga nella chat.
  const event = await prisma.conversationEvent.findFirst({ where: { guidedRequestId: client.first, message: "Il cliente ha ritirato la richiesta." } });
  expect(event).not.toBeNull();

  await page.getByRole("button", { name: "Annulla", exact: true }).click();
  await expect(page.getByText("Richiesta ripristinata")).toBeVisible();
  await expect(card(page, "lavello")).toHaveCount(1);
  const restored = await prisma.guidedRequest.findUniqueOrThrow({ where: { id: client.first } });
  expect(restored.deletedByClientAt).toBeNull();
  expect(restored.status).toBe("OPEN");
  expect(await prisma.lead.findFirstOrThrow({ where: { guidedRequestId: client.first } })).toMatchObject({ status: "PENDING" });
  expect(await prisma.conversationEvent.count({ where: { guidedRequestId: client.first, message: "Il cliente ha ritirato la richiesta." } })).toBe(0);
});

test("dal menu a tre linee; un preventivo inviato dopo non parte", async ({ browser }) => {
  const client = await clientWithRequests("cliente-menu");
  const page = await pageAs(browser, client.email);
  await page.goto("/le-mie-richieste");
  const menu = card(page, "Scaldabagno").getByLabel("Azioni sulla richiesta", { exact: true });
  // La tendina si chiude allo scorrimento: prima si porta il pulsante a vista.
  await menu.scrollIntoViewIfNeeded();
  await menu.click();
  await page.getByText("Elimina richiesta", { exact: true }).click();
  await page.getByRole("dialog", { name: "Eliminare la richiesta?" }).getByRole("button", { name: "Elimina richiesta" }).click();
  await expect(page.getByText("Richiesta eliminata")).toBeVisible();
  await expect(card(page, "Scaldabagno")).toHaveCount(0);

  // Il professionista aveva il modulo del preventivo aperto: l'invio viene rifiutato con la spiegazione.
  const proToken = await login(proEmail);
  const response = await fetch(`${API_URL}/quotes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${proToken}` },
    body: JSON.stringify({
      requestId: client.second,
      items: [{ name: "Sostituzione scaldabagno", priceMinEurCents: 30000 }],
      estimatedStartDate: "2026-12-01T09:00:00.000Z",
    }),
  });
  expect(response.status).toBe(403);
  expect(((await response.json()) as { message: string }).message).toBe("Il cliente ha ritirato questa richiesta.");
  // Nell'elenco del professionista resta, segnata come ritirata.
  const leads = (await (await fetch(`${API_URL}/professionals/me/leads`, { headers: { Authorization: `Bearer ${proToken}` } })).json()) as {
    guidedRequest: { id: string; withdrawnByClient: { reason: string | null } | null };
  }[];
  expect(leads.find((lead) => lead.guidedRequest.id === client.second)?.guidedRequest.withdrawnByClient).toEqual(expect.objectContaining({ reason: null }));
});

test("uscire senza salvare chiede conferma, anche col tasto Indietro", async ({ browser }) => {
  const client = await clientWithRequests("cliente-uscita");
  const page = await pageAs(browser, client.email);
  await page.goto("/le-mie-richieste");

  // Senza modifiche Indietro chiude solo il modulo.
  await openEdit(page, "lavello");
  await page.goBack();
  await expect(page.getByText("Torna alla richiesta")).toHaveCount(0);
  await expect(page).toHaveURL(/\/le-mie-richieste/);

  // Con modifiche: Indietro chiede conferma e si può restare.
  const target = await openEdit(page, "lavello");
  await target.locator("textarea").first().fill("Perdita sotto il lavello e anche sotto la lavastoviglie");
  await page.goBack();
  const exitDialog = page.getByRole("dialog", { name: "Uscire senza salvare?" });
  await expect(exitDialog).toBeVisible();
  await exitDialog.getByText("Continua a modificare").click();
  await expect(page.getByText("Torna alla richiesta")).toBeVisible();

  // Il menu "Le mie richieste" chiede la stessa conferma.
  const menuLink = page.locator('a[href="/le-mie-richieste"]').filter({ visible: true }).first();
  await menuLink.click();
  await expect(exitDialog).toBeVisible();
  await exitDialog.getByText("Esci senza salvare").click();
  await expect(page.getByText("Torna alla richiesta")).toHaveCount(0);
  await expect(page).toHaveURL(/\/le-mie-richieste/);
  expect((await prisma.guidedRequest.findUniqueOrThrow({ where: { id: client.first } })).description).toBe("Perdita sotto il lavello della cucina");
});

test("l'admin decide su una richiesta eliminata, che resta come prova", async () => {
  const client = await clientWithRequests("cliente-admin");
  const clientToken = await login(client.email);
  const deleteResponse = await fetch(`${API_URL}/guided-requests/${client.first}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${clientToken}` },
    body: JSON.stringify({ reason: "MISTAKE" }),
  });
  expect(deleteResponse.ok).toBe(true);

  const proToken = await login(proEmail);
  const reportResponse = await fetch(`${API_URL}/reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${proToken}` },
    body: JSON.stringify({ targetType: "GUIDED_REQUEST", targetId: client.first, reason: "spam" }),
  });
  expect(reportResponse.ok).toBe(true);
  const { id: reportId } = (await reportResponse.json()) as { id: string };

  // Già passato dal codice della verifica in due passaggi (§351).
  const adminToken = testToken(adminId, { amfa: Math.floor(Date.now() / 1000) });
  const admin = (path: string, init: RequestInit = {}) =>
    fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` } });
  const target = (await (await admin(`/admin/reports/${reportId}/target`)).json()) as { exists: boolean; text: string };
  expect(target).toMatchObject({ exists: true, text: "Perdita sotto il lavello della cucina" });
  const decision = await admin(`/admin/reports/${reportId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "RESOLVED", action: "HIDE_CONTENT", ground: "termini-contenuti", resolutionNote: "Richiesta pubblicitaria." }),
  });
  expect(decision.ok).toBe(true);

  // Segnalata: nell'elenco admin senza data di cancellazione, mai cancellata in automatico.
  const rows = (await (await admin("/admin/client-deleted-requests")).json()) as {
    guidedRequestId: string;
    reports: number;
    purgeAt: string | null;
    reasonLabel: string | null;
  }[];
  expect(rows.find((row) => row.guidedRequestId === client.first)).toMatchObject({ reports: 1, purgeAt: null, reasonLabel: "L'ho mandata per sbaglio" });
});
