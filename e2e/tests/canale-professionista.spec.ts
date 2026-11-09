import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Canale del professionista (docs/changelog/2026-11-08-canale-del-professionista.md):
 * "Il tuo link" con link corto e QR; chi apre il link arriva al profilo e la
 * richiesta che manda parte con "Inoltra se non risponde" spento.
 */
test("il professionista trova il suo link, il cliente che lo apre arriva al profilo come cliente suo", async ({ page, browser }) => {
  await page.goto("/dashboard/il-tuo-link");
  await expect(page.getByRole("heading", { name: "Il tuo link", level: 1 })).toBeVisible();
  const linkText = page.getByText(/^[^ ]+\/p\/[a-z2-9]{6}$/);
  await expect(linkText).toBeVisible();
  await expect(page.getByRole("img", { name: /Codice QR del link/ })).toBeVisible();
  // Pulsante per il sito del professionista: il codice porta al suo link.
  await expect(page.getByLabel("Codice del pulsante")).toHaveValue(/^<a href="[^"]+\/p\/[a-z2-9]{6}" target="_blank" rel="noopener"/);
  // Il messaggio dell'invito prende il nome scritto.
  await page.getByLabel("Nome del cliente (facoltativo)").fill("Anna");
  await expect(page.getByLabel("Messaggio")).toHaveValue(/^Ciao Anna, sono Marco Rossi Idraulica\./);
  const axe = await new AxeBuilder({ page }).include("main").analyze();
  expect(axe.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);

  const path = (await linkText.textContent())!.replace(/^.*(\/p\/[a-z2-9]{6})$/, "$1");
  const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const client = await visitor.newPage();
  await client.goto(path);
  await expect(client).toHaveURL(/\/professionista\/[^?]+\?link=1$/);
  // La pagina se lo ricorda nella scheda appena è pronta.
  const storedProfileId = () => client.evaluate(() => Object.keys(sessionStorage).find((key) => key.startsWith("link-personale:"))?.slice("link-personale:".length) ?? null);
  await expect.poll(storedProfileId).not.toBeNull();
  const profileId = await storedProfileId();

  await client.goto(`/preventivo?categoria=idraulico&professionista=${profileId}&nomeProfessionista=Marco%20Rossi%20Idraulica&modalita=ONLINE&descrizione=${encodeURIComponent("Perde il rubinetto della cucina da due giorni.")}`);
  await client.getByRole("group", { name: "Quando ti serve?" }).getByRole("radio", { name: "In settimana" }).check();
  await client.getByText("Avanti", { exact: true }).click();
  await client.getByText("Avanti", { exact: true }).click();
  await expect(client.getByRole("switch", { name: "Inoltra se non risponde" })).toHaveAttribute("aria-checked", "false");
  await visitor.close();
});

test("un codice che non esiste porta alla pagina non trovata", async ({ page }) => {
  const response = await page.goto("/p/zzzzzz");
  expect(response?.status()).toBe(404);
});
