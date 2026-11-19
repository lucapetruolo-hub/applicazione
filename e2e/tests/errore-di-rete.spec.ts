import { expect, test } from "@playwright/test";
import { PrismaClient } from "@professionisti/database";
import { API_URL, WEB_URL } from "../fixtures/env";
import { createClient, testToken } from "../fixtures/preventivi";

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
