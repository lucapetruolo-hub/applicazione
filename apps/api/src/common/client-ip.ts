import { type ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { isIP } from "node:net";
import { timingSafeEqual } from "node:crypto";

/**
 * Chiamate fatte dal server del sito (pagine preparate su Vercel), riconosciute
 * da una chiave segreta che conoscono solo Vercel e Render (`SITE_SERVER_KEY`,
 * docs/changelog/2026-11-16-traffico-elevato.md). Senza, il limite al minuto
 * contava tutti i visitatori sull'indirizzo di Vercel: con ~8 visite al
 * minuto dalla stessa uscita la home restava senza professionisti. Una chiave
 * corta o assente non vale mai.
 */
export const SITE_KEY_HEADER = "x-site-key";
const MIN_SITE_KEY_LENGTH = 32;

export function isSiteServerRequest(req: { headers?: Record<string, string | string[] | undefined> }, expected = process.env.SITE_SERVER_KEY?.trim()): boolean {
  if (!expected || expected.length < MIN_SITE_KEY_LENGTH) return false;
  const header = req.headers?.[SITE_KEY_HEADER];
  if (typeof header !== "string" || !header) return false;
  const given = Buffer.from(header);
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

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
 * è quella giusta, e ad accorgersi se Render cambiasse qualcosa. Guarda la
 * prima richiesta arrivata da fuori (con `X-Forwarded-For`): il controllo
 * `/health` di Render parte dall'interno, senza intestazioni, e la prima
 * versione del log scriveva "ASSENTE" proprio per quello (09/11).
 */
function describeOnce(req: { headers?: Record<string, string | string[] | undefined> }): void {
  if (described || process.env.RENDER !== "true") return;
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded !== "string" || !forwarded.trim()) return;
  described = true;
  const hops = forwarded.split(",").length;
  const has = (name: string) => (typeof req.headers?.[name] === "string" ? "sì" : "no");
  logger.log(
    `Indirizzo del cliente (prima richiesta da fuori): CF-Connecting-IP ${has("cf-connecting-ip") === "sì" ? "presente" : "ASSENTE (si usa req.ip)"}, X-Forwarded-For con ${hops} indirizzi, True-Client-IP ${has("true-client-ip")}, X-Real-IP ${has("x-real-ip")}.`,
  );
}

/** Limite al minuto contato sull'indirizzo vero del cliente (`clientIp`). */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  /**
   * Le pagine del sito preparate sul server non contano nei limiti al minuto:
   * li conta già il browser di ogni visitatore quando chiama l'API, e
   * contarle sull'indirizzo di Vercel bloccava il sito stesso
   * (docs/changelog/2026-11-16-traffico-elevato.md). Contro chi martella le
   * pagine resta la protezione di Vercel (docs/ops/avvisi.md).
   */
  protected override async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Parameters<typeof isSiteServerRequest>[0]>();
    if (request && isSiteServerRequest(request)) return true;
    return super.shouldSkip(context);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const request = req as Parameters<typeof clientIp>[0];
    describeOnce(request);
    // Stessa normalizzazione di prima (IPv6 raggruppati per rete /64).
    return super.getTracker({ ip: clientIp(request) });
  }
}
