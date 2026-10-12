import { formatItalianUntil } from "@professionisti/shared";

/**
 * "Rispondi entro …" per un lead (CLAUDE.md §14): condiviso da Richieste e
 * lavori e dalla Home "Oggi" (docs/CHANGELOG.md §147). Gli orizzonti reali
 * sono brevi (60 minuti o 6 ore prima dell'inoltro di una richiesta diretta, §209-§210), quindi
 * sempre minuti/ore. `null` se la scadenza è passata o non nota.
 */
export function formatLeadDeadline(expiresAt: string | null): { label: string; urgent: boolean } | null {
  if (!expiresAt) return null;
  const diffMs = new Date(expiresAt).getTime() - Date.now();
  if (diffMs <= 0) return null;
  const diffMinutes = Math.ceil(diffMs / 60_000);
  // Urgente (bordo/testo rosso invece di ambra) sotto mezz'ora, a
  // prescindere dal tipo di richiesta — un margine sempre stretto,
  // indipendentemente da quanto tempo aveva a disposizione all'inizio.
  const urgent = diffMinutes <= 30;
  if (diffMinutes < 60) {
    return { label: `Rispondi entro ${diffMinutes} minut${diffMinutes === 1 ? "o" : "i"}`, urgent };
  }
  const diffHours = Math.ceil(diffMinutes / 60);
  return { label: `Rispondi entro ${diffHours} or${diffHours === 1 ? "a" : "e"}`, urgent };
}

/**
 * Richiesta diretta (docs/CHANGELOG.md §209): il professionista scelto non
 * ha scadenza, ma dopo `forwardAt` senza risposta la richiesta va anche ad
 * altri. Stesso formato di formatLeadDeadline.
 */
export function formatForwardDeadline(forwardAt: string | null): { label: string; urgent: boolean } | null {
  const deadline = formatLeadDeadline(forwardAt);
  if (!deadline) return null;
  return { label: `${deadline.label}, poi va anche ad altri professionisti`, urgent: deadline.urgent };
}

/**
 * "Puoi rispondere fino al 12 ottobre alle 15:30" (richiesta esplicita
 * dell'utente, docs/CHANGELOG.md §221): la scadenza della richiesta, in ora
 * italiana. Rossa nelle ultime 24 ore. `null` se passata o non nota.
 */
export function formatRespondUntil(respondUntil: string | null): { label: string; urgent: boolean } | null {
  if (!respondUntil) return null;
  const diffMs = new Date(respondUntil).getTime() - Date.now();
  if (diffMs <= 0) return null;
  return { label: `Puoi rispondere fino ${formatItalianUntil(respondUntil)}`, urgent: diffMs <= 24 * 60 * 60 * 1000 };
}

/**
 * Le scadenze da mostrare su una richiesta da quotare: fino a quando si può
 * rispondere e, per una richiesta diretta, quando va anche ad altri.
 */
export function leadDeadlines(lead: { expiresAt: string | null; respondUntil: string | null; forwardAt: string | null }): { label: string; urgent: boolean }[] {
  const respond = formatLeadDeadline(lead.expiresAt) ?? formatRespondUntil(lead.respondUntil);
  const forward = formatForwardDeadline(lead.forwardAt);
  return [respond, forward].filter((d): d is { label: string; urgent: boolean } => d !== null);
}

/**
 * "N su M altri professionisti hanno già risposto" (docs/CHANGELOG.md §147,
 * decisione esplicita dell'utente): conta solo i preventivi degli altri
 * professionisti che hanno ricevuto la stessa richiesta, mai chi sono.
 * `null` se la richiesta è arrivata solo a te.
 */
export function formatCompetitors({ responded, total }: { responded: number; total: number }): string | null {
  if (total <= 0) return null;
  if (total === 1) return responded > 0 ? "L'altro professionista ha già risposto" : "L'altro professionista non ha ancora risposto";
  if (responded === 0) return `Nessuno degli altri ${total} professionisti ha ancora risposto`;
  return `${responded} su ${total} altri professionisti ${responded === 1 ? "ha" : "hanno"} già risposto`;
}

/**
 * Scadenza di una segnalazione (docs/CHANGELOG.md §167): giorno e ora
 * leggibili, es. "mer 1 ottobre alle 14:30", ora italiana.
 */
export function formatIssueDeadline(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const day = date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "long", timeZone: "Europe/Rome" });
  const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
  return `${day} alle ${time}`;
}

/** La scadenza è già passata (in attesa del controllo orario automatico). */
export function isPastDeadline(iso: string | null): boolean {
  return !!iso && new Date(iso).getTime() <= Date.now();
}
