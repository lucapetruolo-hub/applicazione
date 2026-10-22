import { BadRequestException, Logger } from "@nestjs/common";
import { createHash } from "node:crypto";
import { PWNED_PASSWORD_MESSAGE } from "@professionisti/shared";

const RANGE_URL = "https://api.pwnedpasswords.com/range/";
const logger = new Logger("PwnedPassword");

/**
 * Password già rubate in passato da altri siti (Have I Been Pwned, Pwned
 * Passwords, gratuito e senza chiave; docs/CHANGELOG.md §289, richiesta
 * dell'utente). Anonimo per costruzione (k-anonymity): parte solo l'inizio
 * (5 caratteri) dell'impronta SHA-1 della password, mai la password né
 * l'impronta intera; il confronto col resto avviene qui. `Add-Padding` rende
 * le risposte tutte della stessa lunghezza.
 *
 * - `PWNED_PASSWORD_CHECK=false` su Render lo spegne.
 * - Servizio lento (oltre 3s) o irraggiungibile → la password passa, con un
 *   avviso nei log: un loro disservizio non deve bloccare le iscrizioni.
 */
export async function isPwnedPassword(password: string): Promise<boolean> {
  if (process.env.PWNED_PASSWORD_CHECK === "false") return false;
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${RANGE_URL}${prefix}`, { headers: { "Add-Padding": "true" }, signal: controller.signal });
    if (!response.ok) {
      logger.warn(`Pwned Passwords non disponibile (HTTP ${response.status}): password lasciata passare.`);
      return false;
    }
    const body = await response.text();
    return body.split("\n").some((line) => {
      const [lineSuffix, count] = line.trim().split(":");
      // Le righe di riempimento hanno conteggio 0.
      return lineSuffix === suffix && Number(count) > 0;
    });
  } catch (error) {
    logger.warn(`Pwned Passwords non raggiungibile: ${error instanceof Error ? error.message : error}. Password lasciata passare.`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** Come `isPwnedPassword`, ma risponde 400 se la password è tra quelle rubate. */
export async function assertNotPwnedPassword(password: string): Promise<void> {
  if (await isPwnedPassword(password)) {
    throw new BadRequestException(PWNED_PASSWORD_MESSAGE);
  }
}
