import { cleanMissingTrade, missingTradeKeywords } from "./missingTrades";
import { OUT_OF_SERVICE_KEYWORDS, OUT_OF_SERVICE_LABELS, type ProblemOutOfService } from "./problemMatch";
import type { ProfessionalCategorySlug } from "./categories";

/**
 * Richieste in attesa di un mestiere che nessuno fa ancora vicino al cliente
 * (docs/changelog/2026-11-17-richieste-in-attesa.md, decisioni di Luca del
 * 17/11/2026): una richiesta completa, come le altre, che resta aperta 60
 * giorni e arriva da sola a chi fa quel lavoro appena si iscrive ed è
 * visibile. Il mestiere si riconosce dalle prestazioni, dai patentini e dalla
 * descrizione del professionista, con le stesse parole della ricerca "Chi
 * offre…" (`OUT_OF_SERVICE_KEYWORDS`, `missingTradeKeywords`).
 */

/** Categoria con cui si salva la richiesta finché nessuno la riceve: non decide a chi arriva. */
export const WAITING_REQUEST_HOST_CATEGORY: ProfessionalCategorySlug = "tuttofare";

/** Giorni dopo i quali si chiede al cliente "Ti serve ancora?". */
export const WAITING_REQUEST_STILL_NEEDED_DAYS = 30;

export const WAITING_TRADE_KEYS = Object.keys(OUT_OF_SERVICE_LABELS) as ProblemOutOfService[];

export function isWaitingTradeKey(value: string | null | undefined): value is ProblemOutOfService {
  return Boolean(value) && value! in OUT_OF_SERVICE_LABELS;
}

/**
 * Nome del mestiere mostrato al cliente e al professionista: quello fisso per
 * gli 8 lavori fuori servizio, altrimenti il nome scritto dall'IA ripulito.
 * Null se non è un mestiere (o è uno che il sito ha già).
 */
export function waitingTradeName(trade: { key?: string | null; name?: string | null }): string | null {
  if (isWaitingTradeKey(trade.key)) return OUT_OF_SERVICE_LABELS[trade.key];
  return cleanMissingTrade(trade.name);
}

/** Parole che il professionista deve avere nelle prestazioni, nei patentini o nella descrizione. */
export function waitingTradeKeywords(trade: { key?: string | null; name?: string | null }): string[] {
  if (isWaitingTradeKey(trade.key)) return [...OUT_OF_SERVICE_KEYWORDS[trade.key]];
  return trade.name ? missingTradeKeywords(trade.name) : [];
}

/** Il professionista fa questo lavoro? Stesso confronto della ricerca (senza maiuscole). */
export function textsMatchWaitingTrade(keywords: readonly string[], texts: readonly (string | null | undefined)[]): boolean {
  if (keywords.length === 0) return false;
  const haystack = texts
    .filter(Boolean)
    .join("\n")
    .toLowerCase();
  return keywords.some((word) => haystack.includes(word.toLowerCase()));
}

/** Stato di una richiesta in attesa per l'admin: ancora nessuno, arrivata ad almeno uno, chiusa. */
export type WaitingRequestState = "WAITING" | "SENT" | "CLOSED";

/** Admin › Richieste in attesa (docs/changelog/2026-11-17-richieste-in-attesa.md): mai i contatti del cliente. */
export type WaitingRequestAdminRow = {
  id: string;
  trade: string;
  description: string;
  city: string;
  /** "Bari e provincia", come in "Mestieri che non abbiamo". */
  zone: string;
  state: WaitingRequestState;
  /** Professionisti che l'hanno ricevuta. */
  recipients: number;
  createdAt: string;
  expiresAt: string | null;
  /** Il cliente ha già ricevuto "Ti serve ancora?". */
  stillNeededAskedAt: string | null;
};

export type WaitingRequestAdminGroup = { trade: string; zone: string; waiting: number; oldestCreatedAt: string };

export type WaitingRequestsAdmin = { groups: WaitingRequestAdminGroup[]; rows: WaitingRequestAdminRow[] };

/** Gruppi per mestiere e zona delle sole richieste ancora senza nessuno, i più numerosi prima. */
export function groupWaitingRequests(rows: readonly WaitingRequestAdminRow[]): WaitingRequestAdminGroup[] {
  const groups = new Map<string, WaitingRequestAdminGroup>();
  for (const row of rows) {
    if (row.state !== "WAITING") continue;
    const key = `${row.trade.toLowerCase()}|${row.zone}`;
    const group = groups.get(key);
    if (!group) groups.set(key, { trade: row.trade, zone: row.zone, waiting: 1, oldestCreatedAt: row.createdAt });
    else {
      group.waiting += 1;
      if (row.createdAt < group.oldestCreatedAt) group.oldestCreatedAt = row.createdAt;
    }
  }
  return [...groups.values()].sort((a, b) => b.waiting - a.waiting || a.oldestCreatedAt.localeCompare(b.oldestCreatedAt));
}

/**
 * Annuncio anonimo per cercare chi fa il mestiere (decisione di Luca del
 * 17/11/2026): solo mestiere, zona e numero, mai dati del cliente. Il sito
 * resta un intermediario (CLAUDE.md §5 punto 18): sono richieste di
 * preventivo, il prezzo lo fa il professionista.
 */
export function waitingTradeAd(group: Pick<WaitingRequestAdminGroup, "trade" | "zone" | "waiting">, siteUrl: string): string {
  const zone = group.zone === "Senza città" ? "" : ` (${group.zone})`;
  const clients = group.waiting === 1 ? "1 cliente aspetta" : `${group.waiting} clienti aspettano`;
  return `Fai il lavoro di ${group.trade.toLowerCase()}${zone}? Sul nostro sito ${clients} un preventivo per questo lavoro. Iscriviti: le richieste ti arrivano appena il profilo è attivo, e il prezzo lo decidi tu. ${siteUrl.replace(/\/$/, "")}/per-professionisti`;
}
