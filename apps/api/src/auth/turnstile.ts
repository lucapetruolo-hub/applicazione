import { BadRequestException, Logger } from "@nestjs/common";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const logger = new Logger("Turnstile");

type SiteverifyResponse = { success: boolean; "error-codes"?: string[] };

/**
 * Controllo anti-bot Cloudflare Turnstile sui moduli pubblici: registrazione
 * con email e password, recupero password e contatti (checklist di lancio
 * punto 24, docs/CHANGELOG.md §198).
 *
 * - Senza `TURNSTILE_SECRET_KEY` il controllo è spento (true), come Maps e
 *   Stripe senza chiavi: in sviluppo e finché le chiavi non sono su Render
 *   la registrazione funziona come prima.
 * - Token mancante o rifiutato da Cloudflare → false.
 * - Cloudflare irraggiungibile o lento (oltre 5s) → true con un avviso nei
 *   log: un bot non può causare un guasto di Cloudflare, mentre bloccare
 *   tutte le iscrizioni per un loro disservizio costerebbe utenti veri. Il
 *   limite di 5 registrazioni al minuto per IP resta comunque attivo.
 */
export async function verifyTurnstileToken(token: string | undefined, remoteIp: string | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(SITEVERIFY_URL, { method: "POST", body, signal: controller.signal });
    if (!response.ok) {
      logger.warn(`Turnstile non disponibile (HTTP ${response.status}): richiesta lasciata passare.`);
      return true;
    }
    const data = (await response.json()) as SiteverifyResponse;
    if (!data.success) {
      // "invalid-input-secret" indica una chiave sbagliata su Render, non un bot.
      const codes = data["error-codes"] ?? [];
      if (codes.includes("invalid-input-secret") || codes.includes("missing-input-secret")) {
        logger.error(`TURNSTILE_SECRET_KEY rifiutata da Cloudflare (${codes.join(", ")}).`);
      }
      return false;
    }
    return true;
  } catch (error) {
    logger.warn(`Turnstile non raggiungibile: ${error instanceof Error ? error.message : error}. Richiesta lasciata passare.`);
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

/** Come `verifyTurnstileToken`, ma risponde 400 se la verifica non passa. */
export async function assertTurnstile(token: string | undefined, remoteIp: string | undefined): Promise<void> {
  if (!(await verifyTurnstileToken(token, remoteIp))) {
    throw new BadRequestException("Verifica anti-bot non riuscita: riprova.");
  }
}
