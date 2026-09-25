/**
 * Regole di smistamento delle richieste di preventivo (docs/CHANGELOG.md
 * §154, decisioni esplicite dell'utente): quanti professionisti ricevono una
 * richiesta, entro quando devono rispondere e in che ordine vengono scelti.
 * Funzioni pure, testate in `lead-routing.test.ts`.
 */

/** Professionisti contattati subito: 3 per una richiesta normale, 5 per un'urgente (decisione dell'utente). */
export const LEADS_PER_REQUEST = { standard: 3, urgent: 5 } as const;

/** Tempo per rispondere: 4 ore "di giorno" per una normale, 20 minuti di orologio per un'urgente. */
export const STANDARD_RESPONSE_HOURS = 4;
export const URGENT_RESPONSE_MINUTES = 20;

/** Fascia in cui scorre il tempo di risposta delle richieste normali, ora italiana. */
export const RESPONSE_DAY_START_HOUR = 8;
export const RESPONSE_DAY_END_HOUR = 21;

const ROME_HOUR_FORMAT = new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", hourCycle: "h23" });

function romeHour(date: Date): number {
  return Number(ROME_HOUR_FORMAT.format(date));
}

/**
 * Aggiunge `hours` ore contando solo il tempo tra le 8 e le 21 (ora
 * italiana, ora legale inclusa): una richiesta arrivata alle 23 non scade
 * alle 3 di notte mentre il professionista dorme, ma alle 12 del mattino
 * dopo. Passo di 5 minuti: preciso abbastanza, al massimo poche centinaia
 * di iterazioni.
 */
export function addDaytimeHours(from: Date, hours: number): Date {
  const stepMs = 5 * 60_000;
  let remaining = Math.round((hours * 60) / 5);
  let t = from.getTime();
  // Se si parte di notte, il conteggio inizia alle 8.
  while (remaining > 0) {
    t += stepMs;
    const h = romeHour(new Date(t - stepMs / 2));
    if (h >= RESPONSE_DAY_START_HOUR && h < RESPONSE_DAY_END_HOUR) remaining -= 1;
  }
  return new Date(t);
}

export function computeLeadExpiry(isUrgent: boolean, now: Date = new Date()): Date {
  return isUrgent ? new Date(now.getTime() + URGENT_RESPONSE_MINUTES * 60_000) : addDaytimeHours(now, STANDARD_RESPONSE_HOURS);
}

export type LeadCandidateSignals = {
  id: string;
  /** Tempo medio di risposta in minuti, null se non ancora misurato. */
  avgResponseTimeMinutes: number | null;
  /** Richieste ricevute e a cui ha risposto (preventivo inviato). */
  requestsReceived: number;
  responsesSent: number;
  /** Media recensioni (1-5) e quante sono. */
  avgRating: number | null;
  reviewCount: number;
  /** Appuntamenti rispettati sul totale. */
  honoredAppointments: number;
  totalAppointments: number;
  /** Distanza dalla richiesta e raggio del professionista, null se non calcolabile (online, città non riconosciuta). */
  distanceKm: number | null;
  radiusKm: number | null;
  /** Ha disponibilità in agenda nel giorno richiesto dal cliente; null se il cliente non ha indicato un giorno. */
  availableOnPreferredDay: boolean | null;
  /** Giorni dall'ultimo preventivo inviato sul sito, null se mai. */
  daysSinceLastQuote: number | null;
  /** Richieste ricevute negli ultimi 7 giorni (per distribuire il lavoro). */
  leadsLast7Days: number;
};

/**
 * Punteggio di qualità 0-1 per scegliere chi riceve per primo una
 * richiesta. Pesi: velocità e costanza nel rispondere 30% (in un mercato
 * locale vince chi risponde per primo, CLAUDE.md §8), recensioni 20%,
 * appuntamenti rispettati 15%, vicinanza 15%, disponibilità nel giorno
 * chiesto 10%, attività recente 10%. Poi una correzione di equità: chi ha
 * già ricevuto molte richieste in settimana scende un po', così il lavoro
 * non va sempre agli stessi. Il boost di visibilità NON entra qui
 * (decisione dell'utente: conta solo nei risultati di ricerca).
 * Senza dati si usa un valore neutro, non zero: un professionista nuovo
 * non deve partire penalizzato.
 */
export function leadQualityScore(c: LeadCandidateSignals): number {
  const speed = c.avgResponseTimeMinutes === null ? 0.5 : 1 / (1 + c.avgResponseTimeMinutes / 60);
  const responseRate = c.requestsReceived >= 3 ? Math.min(1, c.responsesSent / c.requestsReceived) : 0.6;
  const responsiveness = 0.5 * speed + 0.5 * responseRate;

  // Media "prudente": con poche recensioni si avvicina a 3,5 su 5.
  const prior = 3.5;
  const priorWeight = 3;
  const rating = c.avgRating === null ? prior : (c.avgRating * c.reviewCount + prior * priorWeight) / (c.reviewCount + priorWeight);
  const ratingScore = (rating - 1) / 4;

  const reliability = c.totalAppointments >= 2 ? c.honoredAppointments / c.totalAppointments : 0.8;

  const proximity = c.distanceKm !== null && c.radiusKm ? Math.max(0, 1 - c.distanceKm / Math.max(c.radiusKm, 1)) : 0.5;

  const availability = c.availableOnPreferredDay === null ? 0.5 : c.availableOnPreferredDay ? 1 : 0.2;

  const d = c.daysSinceLastQuote;
  const activity = d === null ? 0.4 : d <= 1 ? 1 : d <= 7 ? 0.75 : d <= 30 ? 0.45 : 0.15;

  const base =
    0.3 * responsiveness + 0.2 * ratingScore + 0.15 * reliability + 0.15 * proximity + 0.1 * availability + 0.1 * activity;
  const fairness = 1 / (1 + 0.1 * c.leadsLast7Days);
  return base * fairness;
}

/**
 * Sceglie i destinatari: i migliori per punteggio, con un posto riservato a
 * un professionista nuovo (nessuna recensione e poche richieste ricevute),
 * scelto a caso, così chi è appena arrivato riceve comunque lavoro. Il resto
 * va in coda di riserva, in ordine di punteggio.
 */
export function selectLeadRecipients(
  candidates: LeadCandidateSignals[],
  max: number,
  random: () => number = Math.random,
): { selected: string[]; reserve: string[] } {
  const ranked = [...candidates].sort((a, b) => leadQualityScore(b) - leadQualityScore(a));
  if (ranked.length <= max) return { selected: ranked.map((c) => c.id), reserve: [] };

  const isNewcomer = (c: LeadCandidateSignals) => c.reviewCount === 0 && c.requestsReceived < 5;
  const topIds = new Set(ranked.slice(0, max).map((c) => c.id));
  const newcomersOutsideTop = ranked.filter((c) => isNewcomer(c) && !topIds.has(c.id));
  const hasNewcomerInTop = ranked.slice(0, max).some(isNewcomer);

  let selected = ranked.slice(0, max);
  if (!hasNewcomerInTop && newcomersOutsideTop.length > 0) {
    const pick = newcomersOutsideTop[Math.floor(random() * newcomersOutsideTop.length)]!;
    selected = [...ranked.slice(0, max - 1), pick];
  }
  const selectedIds = new Set(selected.map((c) => c.id));
  return { selected: selected.map((c) => c.id), reserve: ranked.filter((c) => !selectedIds.has(c.id)).map((c) => c.id) };
}
