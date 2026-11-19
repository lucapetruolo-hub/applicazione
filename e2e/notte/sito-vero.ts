import type { Browser, BrowserContext, Page } from "@playwright/test";
import { NOTTE_WEB_URL } from "../playwright.notte.config";

/**
 * Accesso al sito vero con gli account di prova
 * (docs/changelog/2026-11-19-prova-notturna-sito-vero.md). Email e password
 * arrivano dai segreti di GitHub: nel repo, che è pubblico, non si scrivono.
 */
export const NOTTE_API_URL = process.env.NOTTE_API_URL ?? "https://professionisti-api-eu.onrender.com";

function secret(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Manca ${name}: aggiungilo tra i segreti di GitHub (docs/ops/avvisi.md).`);
  return value;
}

export async function api<T>(path: string, token: string | null, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${NOTTE_API_URL}${path}`, {
    method,
    headers: { "content-type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function login(email: string): Promise<string> {
  const { token } = await api<{ token: string }>("/auth/login", null, "POST", { email, password: secret("NOTTE_PASSWORD") });
  return token;
}

export const loginClient = () => login(secret("NOTTE_CLIENT_EMAIL"));
export const loginPro = () => login(secret("NOTTE_PRO_EMAIL"));

/** Finestra del browser sul sito vero, con l'accesso già fatto se c'è il token. */
export async function contextAs(browser: Browser, token: string | null): Promise<BrowserContext> {
  return browser.newContext({
    storageState: {
      cookies: [],
      origins: [
        {
          origin: NOTTE_WEB_URL,
          localStorage: [{ name: "cookie-consent-v1", value: "denied" }, ...(token ? [{ name: "professionisti_token", value: token }] : [])],
        },
      ],
    },
  });
}

/**
 * Raccoglie gli errori del browser di una pagina finché non si chiama `stop`.
 * Si ferma prima di lasciare la pagina: il sito chiede alcuni dati a pagina
 * ferma (l'ordine dei mestieri, qualche secondo dopo l'apertura) e il motore
 * di Safari segna come errore una richiesta interrotta dall'uscita, cosa che
 * succede a ogni visitatore e che il sito già gestisce. Nel registro restano
 * comunque le richieste non riuscite e le risposte con errore.
 */
export function watch(page: Page): { errors: string[]; stop: () => void } {
  const errors: string[] = [];
  let watching = true;
  page.on("pageerror", (error) => {
    if (watching) errors.push(`${page.url()}: ${error.message}`);
    else console.log(`[errore dopo l'uscita, non contato] ${page.url()}: ${error.message}`);
  });
  page.on("requestfailed", (request) => console.log(`[richiesta non riuscita] ${page.url()} -> ${request.method()} ${request.url()} (${request.failure()?.errorText ?? "?"})`));
  page.on("response", (response) => { if (response.status() >= 400) console.log(`[risposta ${response.status()}] ${page.url()} -> ${response.request().method()} ${response.url()}`); });
  return { errors, stop: () => { watching = false; } };
}

/** Pagina del sito vero con l'accesso già fatto; raccoglie gli errori del browser. */
export async function pageAs(browser: Browser, token: string | null): Promise<{ page: Page; errors: string[] }> {
  const context = await contextAs(browser, token);
  const page = await context.newPage();
  return { page, errors: watch(page).errors };
}
