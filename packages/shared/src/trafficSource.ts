import { z } from "./zod";

/**
 * Da dove arriva chi manda una richiesta di preventivo (docs/CHANGELOG.md
 * §296, strategia SEO): l'unica prova che Google porta lavoro vero. Solo una
 * categoria, mai l'indirizzo di provenienza né dati personali.
 */
export const TRAFFIC_SOURCES = ["GOOGLE", "OTHER_SEARCH", "SOCIAL", "DIRECT", "OTHER"] as const;
export type TrafficSource = (typeof TRAFFIC_SOURCES)[number];
export const trafficSourceSchema = z.enum(TRAFFIC_SOURCES);

export const TRAFFIC_SOURCE_LABELS: Record<TrafficSource, string> = {
  GOOGLE: "Google",
  OTHER_SEARCH: "Altri motori di ricerca",
  SOCIAL: "Social",
  DIRECT: "Diretto o link salvato",
  OTHER: "Altri siti",
};

const OTHER_SEARCH = /(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org|qwant\.com|yandex\.[a-z]+|baidu\.com|startpage\.com|search\.brave\.com)$/;
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|instagram\.com|l\.instagram\.com|t\.co|twitter\.com|x\.com|linkedin\.com|lnkd\.in|tiktok\.com|youtube\.com|pinterest\.[a-z.]+|reddit\.com|whatsapp\.com|wa\.me|telegram\.org|t\.me)$/;

/**
 * Categoria dalla pagina di provenienza della prima visita (`document.referrer`).
 * Vuoto = diretto (indirizzo scritto, preferiti, app di messaggi che non lo
 * passano). Lo stesso sito = diretto: la prima pagina della visita conta,
 * le successive no.
 */
export function trafficSourceFromReferrer(referrer: string, ownHost: string): TrafficSource {
  if (!referrer) return "DIRECT";
  let host: string;
  try {
    host = new URL(referrer).hostname.toLowerCase();
  } catch {
    return "OTHER";
  }
  if (host === ownHost.toLowerCase()) return "DIRECT";
  if (/(^|\.)google\.[a-z.]+$/.test(host)) return "GOOGLE";
  if (OTHER_SEARCH.test(host)) return "OTHER_SEARCH";
  if (SOCIAL.test(host)) return "SOCIAL";
  return "OTHER";
}
