/**
 * Chiamate dirette a Stripe di prova per la prova dell'iscrizione con la
 * carta (docs/changelog/2026-10-30-iscrizione-carta-solida.md). Solo chiavi
 * `sk_test_`: con una chiave vera la prova si ferma subito.
 */
export function stripeKey(): string | null {
  const key = process.env.E2E_STRIPE_SECRET_KEY ?? "";
  if (!key) return null;
  if (!key.startsWith("sk_test_")) throw new Error("La prova della carta usa solo una chiave Stripe di prova (sk_test_).");
  return key;
}

type Params = Record<string, string | number | boolean | undefined>;

export async function stripe<T = Record<string, unknown>>(method: "GET" | "POST" | "DELETE", path: string, params: Params = {}): Promise<T> {
  const key = stripeKey();
  if (!key) throw new Error("Manca E2E_STRIPE_SECRET_KEY.");
  const body = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) if (value !== undefined) body.append(name, String(value));
  const url = `https://api.stripe.com/v1/${path}${method !== "POST" && body.size ? `?${body}` : ""}`;
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    ...(method === "POST" ? { body } : {}),
  });
  const json = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok) throw new Error(`Stripe ${method} ${path}: ${json.error?.message ?? response.status}`);
  return json;
}
