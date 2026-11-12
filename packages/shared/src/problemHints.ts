import { findComuneByName } from "./data/comuni";
import type { RequestTiming } from "./requestTiming";

/**
 * Indizi presi dal problema scritto per precompilare la richiesta di
 * preventivo (docs/changelog/2026-11-12-haiku-senza-ragionamento.md, scelta di
 * Luca): quando serve e in quale comune. Solo frasi chiare: nel dubbio null, e
 * il cliente può sempre cambiare la scelta nel modulo.
 */

const plain = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’`]/g, "'");

const CALM = /\b(non (e |e' )?urgente|non (c'e|ce|ho) fretta|nessuna fretta|senza fretta|con calma|il mese prossimo)\b/;
const TODAY = /\b(urgente|urgentissimo|urgenza|emergenza|subito|oggi|stasera|stanotte|adesso|immediatamente|al piu presto|prima possibile)\b/;
const WEEK = /\b(domani|dopodomani|in settimana|questa settimana|entro la settimana|nei prossimi giorni|entro pochi giorni)\b/;

/** "Quando ti serve?" dal testo: Oggi, In settimana o Con calma; null se il testo non lo dice. */
export function timingFromProblem(text: string): RequestTiming | null {
  const t = plain(text);
  if (CALM.test(t)) return "CALM";
  if (TODAY.test(t)) return "TODAY";
  if (WEEK.test(t)) return "WEEK";
  return null;
}

/** Parole di casa che sono anche nomi di comuni ("in Casa", "a Villa"): non sono il comune. */
const NOT_A_PLACE = new Set([
  "bagno", "balcone", "camera", "campagna", "cantina", "casa", "centro", "citta", "condominio", "cortile", "cucina",
  "garage", "giardino", "mare", "montagna", "negozio", "paese", "salotto", "scala", "soffitta", "terrazzo", "ufficio", "villa",
]);

const BEFORE_PLACE = /\b(?:a|ad|in|zona|vicino a|presso|provincia di|comune di|abito a|sono di)\s+/g;

/**
 * Il comune scritto nel testo dopo "a", "in", "zona"... (fino a quattro
 * parole, la più lunga che è un comune ISTAT). Con l'iniziale minuscola vale
 * solo un nome di almeno 6 lettere che non è una parola di casa.
 */
export function comuneFromProblem(text: string): string | null {
  const normalized = text.replace(/[’`]/g, "'");
  const lower = plain(normalized);
  for (const match of lower.matchAll(BEFORE_PLACE)) {
    const start = (match.index ?? 0) + match[0].length;
    const words = normalized.slice(start).split(/\s+/).slice(0, 4).map((word) => word.replace(/[.,;:!?)"]+$/, ""));
    for (let n = words.length; n >= 1; n--) {
      const candidate = words.slice(0, n).join(" ");
      const comune = findComuneByName(candidate);
      if (!comune) continue;
      const key = plain(candidate);
      const capitalized = /^\p{Lu}/u.test(candidate);
      if (NOT_A_PLACE.has(key)) break;
      if (!capitalized && key.length < 6) break;
      return comune.name;
    }
  }
  return null;
}
