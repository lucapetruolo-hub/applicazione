import { PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "./categories";
import { OUT_OF_SERVICE_LABELS, type ProblemOutOfService } from "./problemMatch";
import { findComuneByName } from "./data/comuni";

/**
 * Bacheca "Lavori cercati" (docs/changelog/2026-11-17-bacheca-lavori-cercati.md,
 * studio in analisi/bacheca-richieste-versione-profonda.md, decisioni di Luca
 * del 17/11/2026): chiunque vede, in forma anonima, le richieste rimaste
 * senza risposta; per rispondere un professionista si iscrive e passa i
 * controlli di sempre.
 *
 * Entrano solo le richieste generali "non servite": quelle per un mestiere
 * che nessuno fa ancora vicino al cliente (richieste in attesa) subito, le
 * altre dopo 48 ore senza preventivi, così gli iscritti della zona hanno la
 * precedenza. Mai foto, nome, contatti o via: titolo e riassunto li riscrive
 * l'IA senza dati personali, e nei comuni sotto i 5.000 abitanti si mostra
 * solo la provincia.
 */

/** Ore di precedenza agli iscritti della zona prima della bacheca. */
export const BOARD_DELAY_HOURS = 48;
/** Preventivi al massimo per una richiesta presa dalla bacheca. */
export const BOARD_MAX_QUOTES = 5;
/** Giorni in bacheca: la richiesta vale 60 giorni, ma una scheda vecchia fa sembrare il sito fermo. */
export const BOARD_LISTING_DAYS = 30;
/** Schede per pagina: mai l'elenco intero in una volta (regola del traffico). */
export const BOARD_PAGE_SIZE = 20;
/**
 * Richieste nel mese in una provincia da cui le pagine di ricerca per i
 * clienti mostrano il numero (decisione 10 di Luca: "solo da un certo numero,
 * altrimenti sembrano poche").
 */
export const BOARD_CLIENT_COUNT_MIN = 10;

/** Province italiane per sigla (quelle dell'elenco dei comuni del sito). */
export const PROVINCE_NAMES: Record<string, string> = {
  AG: "Agrigento",
  AL: "Alessandria",
  AN: "Ancona",
  AO: "Aosta",
  AR: "Arezzo",
  AP: "Ascoli Piceno",
  AT: "Asti",
  AV: "Avellino",
  BA: "Bari",
  BT: "Barletta-Andria-Trani",
  BL: "Belluno",
  BN: "Benevento",
  BG: "Bergamo",
  BI: "Biella",
  BO: "Bologna",
  BZ: "Bolzano",
  BS: "Brescia",
  BR: "Brindisi",
  CA: "Cagliari",
  CL: "Caltanissetta",
  CB: "Campobasso",
  CI: "Carbonia-Iglesias",
  CE: "Caserta",
  CT: "Catania",
  CZ: "Catanzaro",
  CH: "Chieti",
  CO: "Como",
  CS: "Cosenza",
  CR: "Cremona",
  KR: "Crotone",
  CN: "Cuneo",
  EN: "Enna",
  FM: "Fermo",
  FE: "Ferrara",
  FI: "Firenze",
  FG: "Foggia",
  FC: "Forlì-Cesena",
  FR: "Frosinone",
  GE: "Genova",
  GO: "Gorizia",
  GR: "Grosseto",
  IM: "Imperia",
  IS: "Isernia",
  AQ: "L'Aquila",
  SP: "La Spezia",
  LT: "Latina",
  LE: "Lecce",
  LC: "Lecco",
  LI: "Livorno",
  LO: "Lodi",
  LU: "Lucca",
  MC: "Macerata",
  MN: "Mantova",
  MS: "Massa-Carrara",
  MT: "Matera",
  VS: "Medio Campidano",
  ME: "Messina",
  MI: "Milano",
  MO: "Modena",
  MB: "Monza e Brianza",
  NA: "Napoli",
  NO: "Novara",
  NU: "Nuoro",
  OG: "Ogliastra",
  OT: "Olbia-Tempio",
  OR: "Oristano",
  PD: "Padova",
  PA: "Palermo",
  PR: "Parma",
  PV: "Pavia",
  PG: "Perugia",
  PU: "Pesaro e Urbino",
  PE: "Pescara",
  PC: "Piacenza",
  PI: "Pisa",
  PT: "Pistoia",
  PN: "Pordenone",
  PZ: "Potenza",
  PO: "Prato",
  RG: "Ragusa",
  RA: "Ravenna",
  RC: "Reggio Calabria",
  RE: "Reggio Emilia",
  RI: "Rieti",
  RN: "Rimini",
  RM: "Roma",
  RO: "Rovigo",
  SA: "Salerno",
  SS: "Sassari",
  SV: "Savona",
  SI: "Siena",
  SR: "Siracusa",
  SO: "Sondrio",
  TA: "Taranto",
  TE: "Teramo",
  TR: "Terni",
  TO: "Torino",
  TP: "Trapani",
  TN: "Trento",
  TV: "Treviso",
  TS: "Trieste",
  UD: "Udine",
  VA: "Varese",
  VE: "Venezia",
  VB: "Verbano-Cusio-Ossola",
  VC: "Vercelli",
  VR: "Verona",
  VV: "Vibo Valentia",
  VI: "Vicenza",
  VT: "Viterbo",
};

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

/** Toglie i trattini ai bordi senza espressioni regolari (nessun testo può rallentarle). */
function trimDashes(text: string): string {
  let start = 0;
  let end = text.length;
  while (start < end && text[start] === "-") start += 1;
  while (end > start && text[end - 1] === "-") end -= 1;
  return text.slice(start, end);
}

/** "padova" per PD, "monza-e-brianza" per MB. */
export function provinceSlug(code: string): string {
  return trimDashes(slugify(PROVINCE_NAMES[code] ?? code));
}

let provinceBySlug: Map<string, string> | null = null;

/** Sigla della provincia da uno slug dell'indirizzo, o null. */
export function provinceFromSlug(slug: string): string | null {
  provinceBySlug ??= new Map(Object.keys(PROVINCE_NAMES).map((code) => [provinceSlug(code), code]));
  return provinceBySlug.get(slug.toLowerCase()) ?? null;
}

/** Sigla della provincia di un comune scritto dal cliente, o null se non è un comune. */
export function provinceOfCity(city: string | null | undefined): string | null {
  const comune = city ? findComuneByName(city) : undefined;
  return comune && PROVINCE_NAMES[comune.province] ? comune.province : null;
}

/** Mestieri della bacheca: le categorie del sito e gli 8 lavori fuori servizio. */
export type BoardTrade = ProfessionalCategorySlug | ProblemOutOfService;

export function isBoardTrade(value: string | null | undefined): value is BoardTrade {
  if (!value) return false;
  return value in OUT_OF_SERVICE_LABELS || PROFESSIONAL_CATEGORIES.some((category) => category.slug === value);
}

/** "Idraulico", "Antennista". */
export function boardTradeLabel(trade: BoardTrade): string {
  if (trade in OUT_OF_SERVICE_LABELS) return OUT_OF_SERVICE_LABELS[trade as ProblemOutOfService];
  return PROFESSIONAL_CATEGORIES.find((category) => category.slug === trade)?.label ?? trade;
}

/**
 * Parole delle pagine "Lavora con noi" per gli 8 lavori che il sito non ha
 * tra le categorie (le categorie usano `CATEGORY_SEO_NOUN`).
 */
export const WAITING_TRADE_SEO: Record<ProblemOutOfService, { workTitle: string; findQuestion: string }> = {
  antennista: { workTitle: "Lavoro per antennisti", findQuestion: "un antennista" },
  disinfestazione: { workTitle: "Lavoro nella disinfestazione", findQuestion: "una ditta di disinfestazione" },
  spurghi: { workTitle: "Lavoro negli spurghi", findQuestion: "una ditta di spurghi" },
  spazzacamino: { workTitle: "Lavoro per spazzacamini", findQuestion: "uno spazzacamino" },
  vetraio: { workTitle: "Lavoro per vetrai", findQuestion: "un vetraio" },
  antifurto: { workTitle: "Lavoro per installatori di antifurto", findQuestion: "un installatore di antifurto" },
  ascensori: { workTitle: "Lavoro per tecnici di ascensori", findQuestion: "un tecnico di ascensori" },
  badante: { workTitle: "Lavoro come badante", findQuestion: "una badante" },
};

/** Una scheda pubblica: niente id del cliente, niente foto, niente via. */
export type BoardCard = {
  /** Id della richiesta: serve al pulsante "Rispondi" (iscrizione e poi la richiesta nell'elenco). */
  id: string;
  trade: BoardTrade;
  tradeLabel: string;
  title: string;
  summary: string;
  /** "Padova" o "Provincia di Padova" nei comuni piccoli. */
  place: string;
  province: string;
  serviceMode: "HOME" | "ONLINE" | null;
  /** Come il cliente ha scelto i tempi, già in parole ("Entro la settimana"). */
  timing: string | null;
  photoCount: number;
  quoteCount: number;
  /** Quando è entrata in bacheca. */
  listedAt: string;
};

export type BoardPage = {
  cards: BoardCard[];
  total: number;
  page: number;
  pageSize: number;
};

/** Mestiere e provincia con almeno una richiesta: pagine da linkare e da indicizzare. */
export type BoardSummaryRow = { trade: BoardTrade; province: string; count: number };

export type BoardSummary = { rows: BoardSummaryRow[] };

/** Distanza massima tra la zona del professionista e il lavoro per rispondere dalla bacheca (decisione di Luca). */
export const BOARD_REPLY_RADIUS_KM = 100;

/**
 * Esito di "Rispondi" (PR 2 della bacheca):
 * - added: la richiesta è nel tuo elenco, manda il preventivo;
 * - already: l'avevi già ricevuta;
 * - saved: profilo non ancora completo o visibile, la richiesta ti arriva appena lo è;
 * - other-trade: la richiesta è per un mestiere che non hai nel profilo;
 * - too-far: oltre 100 km dalla tua zona;
 * - no-online: il cliente chiede un lavoro online e tu non lo offri;
 * - full: 5 preventivi già arrivati;
 * - closed: non è più in bacheca (ritirata, scaduta, accettata).
 */
export type BoardReplyStatus = "added" | "already" | "saved" | "other-trade" | "too-far" | "no-online" | "full" | "closed";

export type BoardReplyResult = { status: BoardReplyStatus; requestId: string; tradeLabel?: string };
