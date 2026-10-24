import { expect, test } from "@playwright/test";
import { API_URL } from "../fixtures/env";

/**
 * Agenda senza rete (docs/CHANGELOG.md §288 e §292): dopo un'apertura con la
 * rete, se il server non risponde l'agenda mostra la copia salvata sul
 * telefono con l'ora dell'ultimo aggiornamento.
 */
test("se il server non risponde si vede la copia salvata degli appuntamenti", async ({ page }) => {
  // R1 della verifica (§292): senza rete l'accesso salta e compare "Accedi" al posto della copia.
  // Difetto noto in attesa della decisione dell'utente: quando è corretto questa riga va tolta.
  test.fail(true, "R1: senza rete l'agenda chiede di accedere invece di mostrare la copia salvata");
  await page.clock.setFixedTime(new Date("2026-10-26T08:00:00Z"));
  await page.goto("/dashboard/agenda");
  await expect(page.getByRole("button", { name: /Condominio Aurora/ }).first()).toBeVisible();

  await page.route(`${API_URL}/**`, (route) => route.abort("internetdisconnected"));
  await page.reload();
  await expect(page.getByRole("status").filter({ hasText: "Senza connessione" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Condominio Aurora/ }).first()).toBeVisible();
});
