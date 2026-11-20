import { cleanMissingTrade, missingTradeKeywords } from "./missingTrades";
import {
  OUT_OF_SERVICE_KEYWORDS,
  OUT_OF_SERVICE_LABELS,
  type ProblemOutOfService,
} from "./problemMatch";
import type { ProfessionalCategorySlug } from "./categories";
import type { BoardUseAction } from "./siteStats";

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
export const WAITING_REQUEST_HOST_CATEGORY: ProfessionalCategorySlug =
  "tuttofare";

/** Giorni dopo i quali si chiede al cliente "Ti serve ancora?". */
export const WAITING_REQUEST_STILL_NEEDED_DAYS = 30;

export const WAITING_TRADE_KEYS = Object.keys(
  OUT_OF_SERVICE_LABELS,
) as ProblemOutOfService[];

export function isWaitingTradeKey(
  value: string | null | undefined,
): value is ProblemOutOfService {
  return Boolean(value) && value! in OUT_OF_SERVICE_LABELS;
}

/**
 * Nome del mestiere mostrato al cliente e al professionista: quello fisso per
 * gli 8 lavori fuori servizio, altrimenti il nome scritto dall'IA ripulito.
 * Null se non è un mestiere (o è uno che il sito ha già).
 */
export function waitingTradeName(trade: {
  key?: string | null;
  name?: string | null;
}): string | null {
  if (isWaitingTradeKey(trade.key)) return OUT_OF_SERVICE_LABELS[trade.key];
  return cleanMissingTrade(trade.name);
}

/** Parole che il professionista deve avere nelle prestazioni, nei patentini o nella descrizione. */
export function waitingTradeKeywords(trade: {
  key?: string | null;
  name?: string | null;
}): string[] {
  if (isWaitingTradeKey(trade.key))
    return [...OUT_OF_SERVICE_KEYWORDS[trade.key]];
  return trade.name ? missingTradeKeywords(trade.name) : [];
}

/** Il professionista fa questo lavoro? Stesso confronto della ricerca (senza maiuscole). */
export function textsMatchWaitingTrade(
  keywords: readonly string[],
  texts: readonly (string | null | undefined)[],
): boolean {
  if (keywords.length === 0) return false;
  const haystack = texts.filter(Boolean).join("\n").toLowerCase();
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

export type WaitingRequestAdminGroup = {
  trade: string;
  zone: string;
  waiting: number;
  oldestCreatedAt: string;
};

/** Un mestiere che non abbiamo, quante volte è stato chiesto e dove (in attesa e di prima insieme). */
export type MostRequestedTrade = {
  trade: string;
  requests: number;
  zones: { zone: string; requests: number }[];
};

export type WaitingRequestsAdmin = {
  groups: WaitingRequestAdminGroup[];
  rows: WaitingRequestAdminRow[];
  /** Contatore dei mestieri più richiesti (decisione di Luca del 17/11/2026). */
  mostRequested: MostRequestedTrade[];
  /** Misure della bacheca "Lavori cercati" negli stessi 90 giorni (docs/changelog/2026-11-18-bacheca-cliente.md). */
  board?: BoardAdminCounts;
};

export type BoardAdminCounts = {
  /** Richieste che oggi si vedono nella bacheca. */
  listed: number;
  /** Richieste tolte dal cliente con "Togli dai lavori cercati". */
  optedOut: number;
  /** Professionisti che hanno ricevuto una richiesta toccando "Rispondi". */
  replies: number;
  /** Preventivi mandati per quelle richieste. */
  quotes: number;
  /** Di quelle risposte, quante su richieste a un professionista scelto e poi inoltrate (docs/changelog/2026-11-19-inoltrate-in-lavori-cercati.md). */
  repliesAfterForward: number;
  /** Preventivi da quelle risposte su richieste inoltrate. */
  quotesAfterForward: number;
  /** Richieste tenute da parte per chi deve ancora finire il profilo. */
  claimsPending: number;
  /** Persone che aspettano l'email "Avvisami". */
  alertsPending: number;
  /** Uso di pagina, mappa e "Rispondi" negli ultimi 90 giorni (docs/changelog/2026-11-20-misure-lavori-cercati.md). */
  use: { action: BoardUseAction; count: number }[];
  /** Professionisti iscritti partendo da "Lavori cercati", e quanti hanno mandato un preventivo entro 30 giorni. */
  signupsFromBoard: number;
  signupsFromBoardQuoted: number;
  /** Preventivo entro 7 giorni e ore al primo: richieste in bacheca e richieste generali rimaste fuori. */
  speedOnBoard: BoardSpeedCounts;
  speedOutside: BoardSpeedCounts;
  /** Province e mestieri con richieste in bacheca a cui nessuno può rispondere entro 100 km. */
  uncovered: { province: string; provinceName: string; trade: string; tradeLabel: string; count: number }[];
};

export type BoardSpeedCounts = { requests: number; withQuote: number; medianHours: number | null };

/**
 * Contatore dei mestieri più chiesti (decisioni di Luca del 17/11/2026,
 * docs/changelog/2026-11-17-mestiere-piu-vicino.md e
 * 2026-11-17-invito-precompilato.md): un nome per richiesta, senza badare alle
 * maiuscole, e per ognuno le zone ("Bari 7, Lecce 3"); i più chiesti prima, a
 * pari numero in ordine alfabetico.
 */
export function countRequestedTrades(
  items: readonly { trade: string | null | undefined; zone: string }[],
): MostRequestedTrade[] {
  const counts = new Map<
    string,
    { trade: string; requests: number; zones: Map<string, number> }
  >();
  for (const item of items) {
    const name = item.trade?.trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const found = counts.get(key) ?? {
      trade: name,
      requests: 0,
      zones: new Map<string, number>(),
    };
    found.requests += 1;
    const zone = item.zone.replace(/ e provincia$/, "");
    found.zones.set(zone, (found.zones.get(zone) ?? 0) + 1);
    counts.set(key, found);
  }
  return [...counts.values()]
    .map((item) => ({
      trade: item.trade,
      requests: item.requests,
      zones: [...item.zones]
        .map(([zone, requests]) => ({ zone, requests }))
        .sort(
          (a, b) =>
            b.requests - a.requests || a.zone.localeCompare(b.zone, "it"),
        ),
    }))
    .sort(
      (a, b) => b.requests - a.requests || a.trade.localeCompare(b.trade, "it"),
    );
}

/** Gruppi per mestiere e zona delle sole richieste ancora senza nessuno, i più numerosi prima. */
export function groupWaitingRequests(
  rows: readonly WaitingRequestAdminRow[],
): WaitingRequestAdminGroup[] {
  const groups = new Map<string, WaitingRequestAdminGroup>();
  for (const row of rows) {
    if (row.state !== "WAITING") continue;
    const key = `${row.trade.toLowerCase()}|${row.zone}`;
    const group = groups.get(key);
    if (!group)
      groups.set(key, {
        trade: row.trade,
        zone: row.zone,
        waiting: 1,
        oldestCreatedAt: row.createdAt,
      });
    else {
      group.waiting += 1;
      if (row.createdAt < group.oldestCreatedAt)
        group.oldestCreatedAt = row.createdAt;
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.waiting - a.waiting ||
      a.oldestCreatedAt.localeCompare(b.oldestCreatedAt),
  );
}

/**
 * Annuncio anonimo per cercare chi fa il mestiere (decisione di Luca del
 * 17/11/2026): solo mestiere, zona e numero, mai dati del cliente. Il sito
 * resta un intermediario (CLAUDE.md §5 punto 18): sono richieste di
 * preventivo, il prezzo lo fa il professionista.
 */
export function waitingTradeAd(
  group: Pick<WaitingRequestAdminGroup, "trade" | "zone" | "waiting">,
  siteUrl: string,
): string {
  const zone = group.zone === "Senza città" ? "" : ` (${group.zone})`;
  const clients =
    group.waiting === 1
      ? "1 cliente aspetta"
      : `${group.waiting} clienti aspettano`;
  return `Fai il lavoro di ${group.trade.toLowerCase()}${zone}? Sul nostro sito ${clients} un preventivo per questo lavoro. Iscriviti: le richieste ti arrivano appena il profilo è attivo, e il prezzo lo decidi tu. ${siteUrl.replace(/\/$/, "")}/per-professionisti`;
}

/**
 * "Invita un professionista" da Richieste in attesa (decisione di Luca del
 * 17/11/2026, docs/changelog/2026-11-17-invito-precompilato.md): il modulo
 * dell'Admin si apre con il comune della zona e il mestiere già scritto nella
 * presentazione, così le richieste in attesa gli arrivano appena il profilo è
 * attivo.
 */
export function waitingInviteHref(
  group: Pick<WaitingRequestAdminGroup, "trade" | "zone">,
): string {
  const params = new URLSearchParams({ mestiere: group.trade });
  const city =
    group.zone === "Senza città" ? "" : group.zone.replace(/ e provincia$/, "");
  if (city) params.set("citta", city);
  return `/admin/professionisti?${params.toString()}`;
}

/** Presentazione di partenza con il mestiere: le parole che fanno arrivare le richieste in attesa. */
export function waitingInviteBio(trade: string): string {
  return `Faccio il lavoro di ${trade.trim().toLowerCase()}.`;
}
