import type { UnreadNotification } from "./AuthContext";

/**
 * A quale sezione/tab appartiene ogni tipo di notifica — usato per i
 * numeretti per sezione su /dashboard e /le-mie-richieste (richiesta
 * esplicita dell'utente: "indica anche in quale sezione c'è stato
 * l'aggiornamento"), non solo il totale nell'header.
 */
const PROFESSIONAL_RICHIESTE_TYPES = new Set(["NEW_LEAD", "QUOTE_DATE_PROPOSED", "QUOTE_REJECTED", "TIMELINE_MESSAGE_FROM_CLIENT"]);
const PROFESSIONAL_LAVORI_TYPES = new Set(["QUOTE_ACCEPTED", "BOOKING_NO_SHOW_REPORTED"]);
const CLIENT_RICHIESTE_TYPES = new Set([
  "NEW_QUOTE",
  "QUOTE_DATE_CONFIRMED",
  "QUOTE_DATE_REJECTED",
  "QUOTE_WITHDRAWN",
  "LEAD_DECLINED",
  "QUOTE_DATE_CHANGED",
  "GUIDED_REQUEST_EXPIRED",
  "TIMELINE_MESSAGE_FROM_PROFESSIONAL",
]);
const CLIENT_LAVORI_TYPES = new Set(["JOB_COMPLETED", "BOOKING_CANCELED_BY_PROFESSIONAL"]);
// Messaggi di chat non letti, indipendentemente dal ruolo — un viewer
// riceve sempre e solo il tipo pertinente al proprio lato (mai entrambi),
// quindi sommare i due insiemi è sicuro. Usato per il pallino sulla voce
// di menu "Chat" (richiesta esplicita dell'utente).
const CHAT_MESSAGE_TYPES = new Set(["TIMELINE_MESSAGE_FROM_CLIENT", "TIMELINE_MESSAGE_FROM_PROFESSIONAL"]);

/**
 * Pagina+tab a cui porta un click sul toast di una notifica (richiesta
 * esplicita dell'utente: "se ci cliccano sopra fagli aprire l'aggiornamento
 * relativo a quel banner") — ogni `type` appartiene già a esattamente uno
 * dei quattro insiemi sopra (pagina professionista/cliente × sezione
 * richieste/lavori, mai ambiguo), stessa fonte di verità riusata invece di
 * una seconda mappa parallela.
 */
export function notificationDestination(type: string): { page: "/dashboard" | "/le-mie-richieste"; tab: "richieste" | "lavori" } | null {
  if (PROFESSIONAL_RICHIESTE_TYPES.has(type)) return { page: "/dashboard", tab: "richieste" };
  if (PROFESSIONAL_LAVORI_TYPES.has(type)) return { page: "/dashboard", tab: "lavori" };
  if (CLIENT_RICHIESTE_TYPES.has(type)) return { page: "/le-mie-richieste", tab: "richieste" };
  if (CLIENT_LAVORI_TYPES.has(type)) return { page: "/le-mie-richieste", tab: "lavori" };
  return null;
}

function countByTypes(notifications: UnreadNotification[], types: Set<string>): number {
  return notifications.filter((n) => types.has(n.type)).length;
}

export function professionalSectionCounts(notifications: UnreadNotification[]): { richieste: number; lavori: number } {
  return {
    richieste: countByTypes(notifications, PROFESSIONAL_RICHIESTE_TYPES),
    lavori: countByTypes(notifications, PROFESSIONAL_LAVORI_TYPES),
  };
}

export function clientSectionCounts(notifications: UnreadNotification[]): { richieste: number; lavori: number } {
  return {
    richieste: countByTypes(notifications, CLIENT_RICHIESTE_TYPES),
    lavori: countByTypes(notifications, CLIENT_LAVORI_TYPES),
  };
}

function payloadString(n: UnreadNotification, key: string): string | null {
  if (n.payload && typeof n.payload === "object" && key in n.payload) {
    const value = (n.payload as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return null;
}

/**
 * Conteggio (non solo presenza) delle notifiche non lette per id — richiesta
 * esplicita dell'utente: "aggiungere un pallino rosso di fianco al pulsante
 * contatta/cronologia con un numero all'interno del numero degli
 * aggiornamenti ricevuti". `extractPayloadId` (sotto) resta per il badge
 * booleano "Nuovo" già esistente, derivata da questa mappa per non
 * duplicare il filtro.
 */
function countPayloadId(notifications: UnreadNotification[], key: "guidedRequestId" | "bookingId" | "quoteId"): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notifications) {
    const value = payloadString(n, key);
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function extractPayloadId(notifications: UnreadNotification[], key: "guidedRequestId" | "bookingId" | "quoteId"): Set<string> {
  return new Set(countPayloadId(notifications, key).keys());
}

/**
 * ID delle richieste guidate/prenotazioni con un aggiornamento non letto —
 * richiesta esplicita dell'utente ("rendilo evidente anche nella lista"):
 * oltre al numeretto per sezione (già esistente), la singola card/riga
 * della lista che ha generato la notifica deve distinguersi visivamente
 * (badge "Nuovo"), non solo il conteggio aggregato del tab. Ogni tipo di
 * notifica porta `guidedRequestId` o `bookingId` nel payload (mai
 * entrambi assenti — vedi i punti di creazione in NotificationsService),
 * quindi basta un set per tipo di chiave.
 */
export function unreadGuidedRequestIds(notifications: UnreadNotification[]): Set<string> {
  return extractPayloadId(notifications, "guidedRequestId");
}

export function unreadBookingIds(notifications: UnreadNotification[]): Set<string> {
  return extractPayloadId(notifications, "bookingId");
}

/**
 * ID dei singoli preventivi con un aggiornamento non letto (richiesta
 * esplicita dell'utente: "metti un simbolo sul preventivo... per far capire
 * che è proprio quello che ha ricevuto un aggiornamento") — a differenza di
 * `unreadGuidedRequestIds`, serve a distinguere QUALE preventivo tra più
 * ricevuti per la stessa richiesta (il fan-out, CLAUDE.md §14, può
 * raggiungere più professionisti: una richiesta può avere più preventivi,
 * il numeretto a livello di richiesta da solo non basta a capire quale sia
 * cambiato). La maggior parte degli eventi legati a un preventivo porta già
 * `quoteId` nel payload (NEW_QUOTE, QUOTE_DATE_*, QUOTE_REJECTED,
 * QUOTE_WITHDRAWN — vedi i punti di notify in quotes.service.ts).
 */
export function unreadQuoteIds(notifications: UnreadNotification[]): Set<string> {
  return extractPayloadId(notifications, "quoteId");
}

/**
 * Varianti "conteggio" delle tre mappe sopra (richiesta esplicita
 * dell'utente: il pallino accanto a "Contatta/Cronologia" deve avere "un
 * numero all'interno del numero degli aggiornamenti ricevuti", non solo un
 * indicatore booleano) — stessa granularità già in uso per il badge "Nuovo"
 * (per richiesta guidata, per prenotazione, per singolo preventivo).
 */
export function unreadGuidedRequestCounts(notifications: UnreadNotification[]): Map<string, number> {
  return countPayloadId(notifications, "guidedRequestId");
}
export function unreadBookingCounts(notifications: UnreadNotification[]): Map<string, number> {
  return countPayloadId(notifications, "bookingId");
}
export function unreadQuoteCounts(notifications: UnreadNotification[]): Map<string, number> {
  return countPayloadId(notifications, "quoteId");
}

/**
 * Conteggio per singolo thread cliente↔professionista (richiesta esplicita
 * dell'utente: il pallino su "Contatta/Cronologia" nella sezione "Inviata a"
 * — prima che esista un preventivo — deve riflettere gli aggiornamenti di
 * QUEL professionista specifico, non di un altro nella stessa richiesta a
 * più destinatari). Chiave composita `guidedRequestId:professionalProfileId`
 * — solo i tipi con entrambi i campi nel payload (LEAD_DECLINED,
 * TIMELINE_MESSAGE_FROM_CLIENT/FROM_PROFESSIONAL) contribuiscono; gli altri
 * (es. GUIDED_REQUEST_EXPIRED, senza un professionista specifico) restano
 * fuori per costruzione, corretto: non appartengono a un thread preciso.
 */
export function unreadThreadCounts(notifications: UnreadNotification[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of notifications) {
    const guidedRequestId = payloadString(n, "guidedRequestId");
    const professionalProfileId = payloadString(n, "professionalProfileId");
    if (!guidedRequestId || !professionalProfileId) continue;
    const key = `${guidedRequestId}:${professionalProfileId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Somma additiva di due mappe conteggio (nuova istanza, mai muta gli
 * argomenti) — usata per i poll periodici di `/dashboard`,
 * `/dashboard/richieste` e `/le-mie-richieste` (richiesta esplicita
 * dell'utente: "al professionista ancora non si capisce che è arrivato un
 * nuovo messaggio da quella particolare richiesta"): ogni tick del poll
 * interroga `GET /notifications/unread`, che per costruzione restituisce
 * solo le notifiche arrivate DOPO l'ultimo `markNotificationsRead()` (il
 * tick precedente le ha già segnate come lette) — sommare invece di
 * sostituire mantiene visibili i pallini già mostrati in questa sessione
 * finché non vengono esplicitamente aperti/letti in UI.
 */
export function mergeCounts(base: Map<string, number>, extra: Map<string, number>): Map<string, number> {
  if (extra.size === 0) return base;
  const merged = new Map(base);
  for (const [key, value] of extra) merged.set(key, (merged.get(key) ?? 0) + value);
  return merged;
}

export function mergeIds(base: Set<string>, extra: Set<string>): Set<string> {
  if (extra.size === 0) return base;
  return new Set([...base, ...extra]);
}

/**
 * Numeretto per voce del menu account (AccountMenu, header) — richiesta
 * esplicita dell'utente: oltre al totale accanto al nome, il numero deve
 * comparire anche sulla voce di menu che porta alla pagina con la novità
 * (es. "Dashboard" per un professionista, "Le mie visite" per un cliente).
 * Tutte le notifiche esistenti per un ruolo confluiscono oggi in un'unica
 * pagina (rispettivamente /dashboard e /le-mie-richieste — le due liste già
 * coperte da professionalSectionCounts/clientSectionCounts sopra), quindi
 * la mappa è {"href": count} con una sola voce diversa da zero.
 */
export function accountMenuUnreadCounts(isProfessional: boolean, notifications: UnreadNotification[]): Record<string, number> {
  const chat = countByTypes(notifications, CHAT_MESSAGE_TYPES);
  if (isProfessional) {
    const { richieste, lavori } = professionalSectionCounts(notifications);
    // "Dashboard" (riepilogo di entrambe le sezioni) porta il totale;
    // "Richieste ricevute" (/dashboard/richieste, l'inbox completa dove
    // vivono davvero dettaglio e azioni dopo la deduplicazione) porta solo
    // gli aggiornamenti pertinenti a quella sezione. "Chat" (richiesta
    // esplicita dell'utente) porta solo i messaggi di conversazione non
    // letti, un sottoinsieme di "richieste".
    return { "/dashboard": richieste + lavori, "/dashboard/richieste": richieste, "/chat": chat };
  }
  const { richieste, lavori } = clientSectionCounts(notifications);
  return { "/le-mie-richieste": richieste + lavori, "/chat": chat };
}
