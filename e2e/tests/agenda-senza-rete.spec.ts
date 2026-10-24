import { expect, test } from "@playwright/test";
import { API_URL } from "../fixtures/env";

/**
 * Agenda senza rete (docs/CHANGELOG.md §288 e §292): dopo un'apertura con la
 * rete, se il server non risponde l'agenda mostra la copia salvata sul
 * telefono con l'ora dell'ultimo aggiornamento.
 */
test("se il server non risponde si vede la copia salvata degli appuntamenti", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-26T08:00:00Z"));
  await page.goto("/dashboard/agenda");
  await expect(page.getByRole("button", { name: /Condominio Aurora/ }).first()).toBeVisible();

  await page.route(`${API_URL}/**`, (route) => route.abort("internetdisconnected"));
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Senza connessione" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Condominio Aurora/ }).first()).toBeVisible();
});

test("senza rete del tutto l'agenda si riapre lo stesso e mostra la copia salvata", async ({ page, context }) => {
  // R1 della verifica (§292-§293): in cantiere manca anche la pagina, non solo il server.
  await page.clock.setFixedTime(new Date("2026-10-26T08:00:00Z"));
  await page.goto("/dashboard/agenda");
  await expect(page.getByRole("button", { name: /Condominio Aurora/ }).first()).toBeVisible();
  // La pagina si salva solo quando il service worker la controlla: serve una seconda apertura con la rete.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect(page.getByRole("button", { name: /Condominio Aurora/ }).first()).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Senza connessione" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Condominio Aurora/ }).first()).toBeVisible();
  await context.setOffline(false);
});
