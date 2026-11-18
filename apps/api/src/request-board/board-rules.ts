import {
  BOARD_DELAY_HOURS,
  BOARD_LISTING_DAYS,
  BOARD_MAX_QUOTES,
  BOARD_REPLY_RADIUS_KM,
  PROVINCE_NAMES,
  boardTradeLabel,
  REQUEST_TIMING_LABEL,
  findComuneByName,
  isBoardTrade,
  isWaitingTradeKey,
  textsMatchWaitingTrade,
  waitingTradeKeywords,
  type BoardCard,
  type BoardTrade,
  type RequestTiming,
} from "@professionisti/shared";
import { anonymizeProblemText } from "../problem-match/problem-match.service";
import { calculateDistanceKm } from "../common/geo.util";
import { isLargeComune } from "./large-comuni";

/**
 * Regole della bacheca "Lavori cercati" senza database, per le prove
 * (docs/changelog/2026-11-17-bacheca-lavori-cercati.md).
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Preventivi che contano per i posti: ritirati e rifiutati non tolgono un posto. */
export const ACTIVE_QUOTE_STATUSES = ["SENT", "ACCEPTED", "MODIFICATION_REQUESTED"] as const;

/** Da quando una richiesta normale può entrare in bacheca (le 48 ore degli iscritti della zona). */
export function boardDelayCutoff(now: Date): Date {
  return new Date(now.getTime() - BOARD_DELAY_HOURS * HOUR_MS);
}

/** Le schede più vecchie di così escono dalla bacheca. */
export function boardListingCutoff(now: Date): Date {
  return new Date(now.getTime() - BOARD_LISTING_DAYS * DAY_MS);
}

/**
 * Mestiere della scheda: la categoria della richiesta, o per una richiesta in
 * attesa la chiave del lavoro fuori servizio. Un mestiere proposto dall'IA
 * senza chiave (es. "Restauratore") non ha ancora una pagina: null.
 */
export function boardTradeOf(request: { categorySlug: string; waitingTrade: string | null; waitingTradeKey: string | null }): BoardTrade | null {
  if (request.waitingTrade) return isWaitingTradeKey(request.waitingTradeKey) ? request.waitingTradeKey : null;
  return isBoardTrade(request.categorySlug) ? request.categorySlug : null;
}

/**
 * Luogo mostrato a tutti: il comune se ha almeno 5.000 abitanti, altrimenti
 * "Provincia di …". Null se la città non è un comune dell'elenco (la
 * richiesta non entra: non sapremmo in che pagina metterla).
 */
export function boardPlaceOf(city: string | null | undefined): { place: string; province: string } | null {
  const comune = city ? findComuneByName(city) : undefined;
  if (!comune) return null;
  const provinceName = PROVINCE_NAMES[comune.province];
  if (!provinceName) return null;
  return {
    place: isLargeComune(comune.name, comune.province) ? comune.name : `Provincia di ${provinceName}`,
    province: comune.province,
  };
}

/**
 * Testo da mandare all'IA per il riassunto: senza email, numeri, link e vie
 * (le toglie già il sito prima che il testo esca), al massimo 1.500 caratteri.
 */
export function boardSourceText(description: string): string {
  return anonymizeProblemText(description.replace(/\s+/g, " ")).slice(0, 1500);
}

/**
 * Ultimo controllo sul testo dell'IA prima di pubblicarlo: se contiene ancora
 * qualcosa che somiglia a un contatto o a un indirizzo, o i segni lasciati
 * dalla pulizia, la richiesta non entra in bacheca.
 */
export function boardTextIsClean(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (/\[(email|link|numero|indirizzo)\]/i.test(trimmed)) return false;
  return anonymizeProblemText(trimmed) === trimmed && !/\b(whatsapp|telegram|instagram|facebook)\b/i.test(trimmed);
}

export type BoardRow = {
  id: string;
  boardTrade: string | null;
  boardTitle: string | null;
  boardSummary: string | null;
  boardPlace: string | null;
  boardProvince: string | null;
  boardAt: Date | null;
  serviceMode: "HOME" | "ONLINE" | null;
  timing: RequestTiming | null;
  photoCount: number;
  quoteCount: number;
};

/** Scheda pubblica da una riga; null se manca un pezzo o i posti sono finiti. */
export function boardCardOf(row: BoardRow): BoardCard | null {
  if (!row.boardAt || !row.boardTitle || !row.boardSummary || !row.boardPlace || !row.boardProvince) return null;
  if (!isBoardTrade(row.boardTrade)) return null;
  if (row.quoteCount >= BOARD_MAX_QUOTES) return null;
  return {
    id: row.id,
    trade: row.boardTrade,
    tradeLabel: boardTradeLabel(row.boardTrade),
    title: row.boardTitle,
    summary: row.boardSummary,
    place: row.boardPlace,
    province: row.boardProvince,
    serviceMode: row.serviceMode,
    timing: row.timing && row.timing !== "TODAY" ? REQUEST_TIMING_LABEL[row.timing] : null,
    photoCount: row.photoCount,
    quoteCount: row.quoteCount,
    listedAt: row.boardAt.toISOString(),
  };
}

/** Prima le schede con meno preventivi (scelta di Luca: dove serve di più), poi le più recenti. */
export function sortBoardCards(cards: BoardCard[]): BoardCard[] {
  return [...cards].sort((a, b) => a.quoteCount - b.quoteCount || b.listedAt.localeCompare(a.listedAt));
}

/**
 * Chi può rispondere a una scheda (decisione di Luca): solo chi fa quel
 * mestiere (categoria del profilo o di una prestazione; per i lavori che il
 * sito non ha, le parole del lavoro nelle prestazioni, nei patentini o nella
 * descrizione) ed entro 100 km dalla sua zona. Un lavoro online va solo a
 * chi offre la consulenza online, a qualunque distanza.
 */
export function boardReplyProblem(input: {
  request: { boardTrade: string; waitingTrade: string | null; waitingTradeKey: string | null; serviceMode: string | null; city: string };
  profile: {
    categorySlugs: string[];
    services: { name: string; categorySlug: string | null }[];
    certifications: string | null;
    bio: string | null;
    latitude: number;
    longitude: number;
    remoteAvailable: boolean;
  };
}): "other-trade" | "too-far" | "no-online" | null {
  const { request, profile } = input;
  if (request.waitingTrade) {
    const keywords = waitingTradeKeywords({ key: request.waitingTradeKey, name: request.waitingTrade });
    const texts = [...profile.services.map((service) => service.name), profile.certifications, profile.bio];
    if (keywords.length === 0 || !textsMatchWaitingTrade(keywords, texts)) return "other-trade";
  } else {
    const slugs = new Set([...profile.categorySlugs, ...profile.services.flatMap((service) => (service.categorySlug ? [service.categorySlug] : []))]);
    if (!slugs.has(request.boardTrade)) return "other-trade";
  }
  if (request.serviceMode === "ONLINE") return profile.remoteAvailable ? null : "no-online";
  if (profile.latitude === 0 && profile.longitude === 0) return "too-far";
  const comune = findComuneByName(request.city);
  if (!comune) return "too-far";
  return calculateDistanceKm(comune.lat, comune.lon, profile.latitude, profile.longitude) > BOARD_REPLY_RADIUS_KM ? "too-far" : null;
}
