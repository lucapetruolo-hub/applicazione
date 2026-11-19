import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { API_URL, WEB_URL } from "../fixtures/env";
import { PHONE, createClient, createProfessional, pageAsClient, testToken, wallDay } from "../fixtures/preventivi";

/**
 * Rete che salta durante accesso e registrazione
 * (docs/changelog/2026-11-19-errore-di-rete-in-italiano.md): Luca ha letto
 * "Failed to fetch" registrandosi mentre l'API si riavviava. Mai più il
 * messaggio inglese del browser: frase italiana, una riprova da sola e
 * "Riprova"; se l'account era già stato creato si entra e basta.
 */
test.use({
  storageState: { cookies: [], origins: [{ origin: WEB_URL, localStorage: [{ name: "cookie-consent-v1", value: "denied" }] }] },
});

const token = (page: import("@playwright/test").Page) => page.evaluate(() => window.localStorage.getItem("professionisti_token"));

test("accesso senza rete: frase italiana con Riprova, mai Failed to fetch", async ({ page }) => {
  let calls = 0;
  await page.route(`${API_URL}/auth/login`, (route) => {
    calls++;
    return route.abort("internetdisconnected");
  });
  await page.goto("/accedi");
  await page.getByRole("textbox", { name: "Email" }).fill("nessuno@example.com");
  await page.getByRole("textbox", { name: "Password" }).fill("Password-di-prova-1");
  await page.getByRole("button", { name: "Accedi", exact: true }).click();

  const alert = page.getByRole("alert").filter({ hasText: "Non riusciamo a collegarci al sito" });
  await expect(alert).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/fetch/i)).toHaveCount(0);
  await expect(alert.getByRole("button", { name: "Riprova" })).toBeVisible();
  // Una riprova da sola prima dell'errore.
  expect(calls).toBe(2);
});

test("registrazione con la risposta persa: l'account creato si apre, nessun errore", async ({ page }) => {
  const email = `rete.${Date.now()}@example.com`;
  let first = true;
  await page.route(`${API_URL}/auth/register`, async (route) => {
    if (!first) return route.continue();
    first = false;
    // L'invio arriva e l'account nasce, ma la risposta si perde (API che si riavvia).
    await route.fetch();
    return route.abort("connectionreset");
  });
  await page.goto("/registrati?ruolo=cliente");
  await page.getByRole("textbox", { name: "Email" }).fill(email);
  await page.getByRole("button", { name: "Continua" }).click();
  await page.getByRole("textbox", { name: "Password", exact: true }).fill("Prova-Rete-2026!");
  await page.getByRole("textbox", { name: "Conferma password" }).fill("Prova-Rete-2026!");
  await page.getByRole("button", { name: "Crea account" }).click();

  await expect.poll(() => token(page), { timeout: 15_000 }).not.toBeNull();
  await expect(page.getByText(/fetch/i)).toHaveCount(0);
  await expect(page.getByText("Esiste già un account")).toHaveCount(0);
});

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

test("richiesta di preventivo con la risposta persa: una sola richiesta salvata e \"Richiesta inviata\"", async ({ page }) => {
  const client = await createClient(prisma);
  await page.addInitScript((value) => window.localStorage.setItem("professionisti_token", value), testToken(client.id));
  let first = true;
  await page.route(`${API_URL}/guided-requests`, async (route) => {
    if (route.request().method() !== "POST" || !first) return route.fallback();
    first = false;
    // La richiesta arriva e si salva, ma la risposta si perde.
    await route.fetch();
    return route.abort("connectionreset");
  });
  const description = encodeURIComponent(`Perdita sotto il lavandino, prova rete ${Date.now()}.`);
  await page.goto(`/preventivo?categoria=idraulico&citta=Latina&modalita=ONLINE&descrizione=${description}`);
  await page.getByRole("group", { name: "Quando ti serve?" }).getByRole("radio", { name: "Con calma" }).check();
  await page.getByText("Avanti", { exact: true }).click();
  await page.getByText("Avanti", { exact: true }).click();
  await page.getByRole("button", { name: /^Invia richiesta/ }).click();

  await expect(page.getByRole("heading", { level: 1 }).filter({ hasText: /richiesta è (arrivata|registrata)/ })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/fetch|Hai già mandato/i)).toHaveCount(0);
  expect(await prisma.guidedRequest.count({ where: { clientId: client.id } })).toBe(1);
});

test("preventivo con la risposta persa: uno solo, nessun avviso doppio al cliente, nessuna riga \"modificato\" in chat", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "telefono-italia", "Basta un progetto.");
  const pro = await createProfessional(prisma, "Rete Idraulica");
  await prisma.availabilitySlot.createMany({
    data: [1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ professionalProfileId: pro.id, dayOfWeek, startTime: "14:00", endTime: "20:00", allowsHome: true, homeMaxBookings: 1 })),
  });
  await prisma.professionalService.create({ data: { professionalProfileId: pro.id, name: "Sostituzione rubinetto", priceMinEurCents: 5000, priceMaxEurCents: 8000, categorySlug: "idraulico" } });
  let preferred = wallDay(5, "00:00");
  while (preferred.getUTCDay() === 0) preferred = new Date(preferred.getTime() + 86_400_000);
  const client = await createClient(prisma);
  const category = await prisma.category.findFirstOrThrow({ where: { slug: "idraulico" } });
  const request = await prisma.guidedRequest.create({
    data: { clientId: client.id, categoryId: category.id, description: "Il rubinetto della cucina perde, prova rete.", city: "Latina", serviceMode: "HOME", preferredDate: preferred, preferredTimeSlot: "14:00-20:00" },
  });
  await prisma.lead.create({ data: { guidedRequestId: request.id, professionalProfileId: pro.id, priceEurCents: 0 } });
  const owner = await prisma.professionalProfile.findUniqueOrThrow({ where: { id: pro.id } });

  const page = await pageAsClient(browser, owner.userId, PHONE);
  let first = true;
  let sends = 0;
  await page.route(`${API_URL}/quotes`, async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    sends++;
    if (!first) return route.fallback();
    first = false;
    // Il preventivo arriva e si salva, ma la risposta si perde.
    await route.fetch();
    return route.abort("connectionreset");
  });
  await page.goto("/dashboard/richieste");
  await page.getByText("Il rubinetto della cucina perde, prova rete", { exact: false }).first().click();
  await page.getByRole("button", { name: "Prepara il preventivo" }).first().click();
  await page.locator(".quick-service-pill").filter({ hasText: "Sostituzione rubinetto" }).click();
  await page.getByRole("button", { name: "Invia preventivo" }).click();

  await expect.poll(() => prisma.quote.count({ where: { guidedRequestId: request.id, status: "SENT" } }), { timeout: 15_000 }).toBe(1);
  // La riprova da sola è partita e il modulo si è chiuso, senza errori.
  await expect.poll(() => sends, { timeout: 15_000 }).toBe(2);
  await expect(page.getByRole("button", { name: "Invia preventivo" })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator(".quick-service-pill")).toHaveCount(0);
  await expect(page.getByText(/fetch/i)).toHaveCount(0);
  const events = await prisma.conversationEvent.findMany({ where: { guidedRequestId: request.id }, select: { message: true } });
  expect(events.filter((e) => /modificato|aggiornato/.test(e.message ?? ""))).toEqual([]);
  const notices = await prisma.notification.findMany({ where: { userId: client.id, type: { in: ["NEW_QUOTE", "QUOTE_UPDATED", "QUOTE_DATE_CHANGED"] } }, select: { type: true, channel: true } });
  expect(notices.filter((n) => n.type !== "NEW_QUOTE")).toEqual([]);
  await page.context().close();
});
