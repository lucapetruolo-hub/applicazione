import { expect, test } from "@playwright/test";
import { loginClient, loginPro, pageAs } from "./sito-vero";

/**
 * Le pagine più usate del sito vero, aperte con i motori di Safari e di
 * Firefox (docs/changelog/2026-11-19-prova-notturna-sito-vero.md): devono
 * aprirsi con il loro titolo, senza errori del browser e senza uscire dallo
 * schermo di lato.
 */
const PUBLIC_PAGES = ["/", "/per-professionisti", "/prezzi", "/faq", "/accedi"];
const CLIENT_PAGES = ["/le-mie-richieste"];
const PRO_PAGES = ["/dashboard", "/dashboard/agenda", "/dashboard/richieste"];

async function check(pages: string[], token: string | null, browser: Parameters<typeof pageAs>[0]) {
  const { page, errors } = await pageAs(browser, token);
  for (const path of pages) {
    const response = await page.goto(path, { waitUntil: "load" });
    expect(response?.status(), path).toBeLessThan(400);
    await expect(page.locator("h1, h2").first(), path).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${path} esce dallo schermo`).toBe(true);
    // Chi ha fatto l'accesso non deve essere rimandato alla pagina di accesso.
    if (token) expect(new URL(page.url()).pathname, path).not.toBe("/accedi");
  }
  expect(errors, "errori del browser").toEqual([]);
  await page.context().close();
}

test("pagine pubbliche", async ({ browser }) => check(PUBLIC_PAGES, null, browser));
test("area del cliente", async ({ browser }) => check(CLIENT_PAGES, await loginClient(), browser));
test("area del professionista", async ({ browser }) => check(PRO_PAGES, await loginPro(), browser));
