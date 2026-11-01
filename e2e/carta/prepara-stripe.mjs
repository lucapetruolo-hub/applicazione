import { appendFileSync } from "node:fs";

/**
 * Prezzo Base mensile e aliquota IVA sull'account Stripe di prova per la
 * prova dell'iscrizione con la carta
 * (docs/changelog/2026-10-30-iscrizione-carta-solida.md), creati una volta e
 * poi ritrovati: la prova non dipende da prezzi fatti a mano. Scrive le
 * variabili per l'API in $GITHUB_ENV (o le stampa). Solo chiavi `sk_test_`.
 */
const key = process.env.E2E_STRIPE_SECRET_KEY ?? "";
if (!key) {
  console.log("E2E_STRIPE_SECRET_KEY assente: niente da preparare.");
  process.exit(0);
}
if (!key.startsWith("sk_test_")) {
  console.error("La prova della carta usa solo una chiave Stripe di prova (sk_test_).");
  process.exit(1);
}

async function stripe(method, path, params = {}) {
  const body = new URLSearchParams(Object.entries(params).map(([name, value]) => [name, String(value)]));
  const response = await fetch(`https://api.stripe.com/v1/${path}${method === "GET" ? `?${body}` : ""}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    ...(method === "POST" ? { body } : {}),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`Stripe ${method} ${path}: ${json.error?.message ?? response.status}`);
  return json;
}

const prices = await stripe("GET", "prices", { "lookup_keys[]": "e2e_base_mensile", active: true });
const price =
  prices.data[0] ??
  (await stripe("POST", "prices", {
    currency: "eur",
    unit_amount: 1900,
    "recurring[interval]": "month",
    lookup_key: "e2e_base_mensile",
    "product_data[name]": "Base (prova automatica)",
  }));
const rates = await stripe("GET", "tax_rates", { active: true, limit: 100 });
const rate =
  rates.data.find((item) => item.metadata?.e2e === "iva") ??
  (await stripe("POST", "tax_rates", { display_name: "IVA", percentage: 22, inclusive: false, country: "IT", "metadata[e2e]": "iva" }));

const lines = [`STRIPE_PRICE_BASE=${price.id}`, `STRIPE_TAX_RATE_IVA=${rate.id}`];
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, `${lines.join("\n")}\n`);
else console.log(lines.join("\n"));
