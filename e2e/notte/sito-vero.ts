import type { Browser, Page } from "@playwright/test";
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

/** Pagina del sito vero con l'accesso già fatto; raccoglie gli errori del browser. */
export async function pageAs(browser: Browser, token: string | null): Promise<{ page: Page; errors: string[] }> {
  const context = await browser.newContext({
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
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  return { page, errors };
}
