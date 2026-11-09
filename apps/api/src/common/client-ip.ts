import { Injectable, Logger } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { isIP } from "node:net";

/**
 * Indirizzo di chi chiama l'API (controllo pre-lancio dell'08/11, E2-02,
 * docs/changelog/2026-11-08-sicurezza-controllo-lancio.md).
 *
 * Su Render l'API sta dietro Cloudflare e poi dietro il proxy di Render: con
 * `trust proxy 1` Express prende come `req.ip` un nodo intermedio che cambia
 * da richiesta a richiesta (verificato dal vivo: due richieste di seguito
 * finivano in due conti diversi del limite al minuto). Così i limiti stretti
 * (login, registrazione, recupero password) non frenavano chi insiste, e più
 * persone vere potevano condividere lo stesso conto.
 *
 * Cloudflare scrive in `CF-Connecting-IP` l'indirizzo di chi si collega e
 * sovrascrive quello che manda il browser, quindi non si può falsificare.
 * Si legge solo su Render (`RENDER=true`, impostata da Render stesso): in
 * locale e nella CI chiunque potrebbe scriverlo, lì resta `req.ip`. Mai il
 * primo indirizzo di `X-Forwarded-For`, che il chiamante può scrivere da sé.
 */
export function clientIp(req: { ip?: string; headers?: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }): string {
  if (process.env.RENDER === "true") {
    const header = req.headers?.["cf-connecting-ip"];
    const value = typeof header === "string" ? header.trim() : undefined;
    if (value && isIP(value)) return value;
  }
  return req.ip ?? req.socket?.remoteAddress ?? "sconosciuto";
}

const logger = new Logger("ClientIp");
let described = false;

/**
 * Una volta per avvio scrive nel log di Render quali intestazioni arrivano,
 * senza indirizzi (dato personale): serve a confermare che la lettura sopra
 * è quella giusta, e ad accorgersi se Render cambiasse qualcosa.
 */
function describeOnce(req: { headers?: Record<string, string | string[] | undefined> }): void {
  if (described || process.env.RENDER !== "true") return;
  described = true;
  const forwarded = req.headers?.["x-forwarded-for"];
  const hops = typeof forwarded === "string" ? forwarded.split(",").length : 0;
  const hasCf = typeof req.headers?.["cf-connecting-ip"] === "string";
  logger.log(`Indirizzo del cliente: CF-Connecting-IP ${hasCf ? "presente" : "ASSENTE (si usa req.ip)"}, X-Forwarded-For con ${hops} indirizzi.`);
}

/** Limite al minuto contato sull'indirizzo vero del cliente (`clientIp`). */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as Parameters<typeof clientIp>[0];
    describeOnce(request);
    // Stessa normalizzazione di prima (IPv6 raggruppati per rete /64).
    return super.getTracker({ ip: clientIp(request) });
  }
}
