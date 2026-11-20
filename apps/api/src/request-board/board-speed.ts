/**
 * Il numero che conta della bacheca (proposta E, docs/changelog/2026-11-20-misure-lavori-cercati.md):
 * quante richieste ricevono almeno un preventivo entro 7 giorni da quando
 * partono (l'ingresso in bacheca, o per quelle rimaste fuori il momento in
 * cui sarebbero entrate) e in quante ore arriva il primo, a metà.
 */
export const BOARD_SPEED_DAYS = 7;
const HOUR_MS = 3_600_000;

export type BoardSpeed = {
  /** Richieste partite da almeno 7 giorni: solo per loro la quota è giusta. */
  requests: number;
  /** Di queste, quante hanno avuto un preventivo entro 7 giorni. */
  withQuote: number;
  /** Ore al primo preventivo, a metà, tra quelle che lo hanno avuto; null senza casi. */
  medianHours: number | null;
};

export function boardSpeed(rows: { start: Date; quotes: Date[] }[], now: Date): BoardSpeed {
  const limit = BOARD_SPEED_DAYS * 24 * HOUR_MS;
  let requests = 0;
  let withQuote = 0;
  const hours: number[] = [];
  for (const row of rows) {
    const first = row.quotes.filter((quote) => quote.getTime() >= row.start.getTime()).sort((a, b) => a.getTime() - b.getTime())[0];
    const wait = first ? first.getTime() - row.start.getTime() : null;
    if (wait !== null && wait <= limit) hours.push(wait / HOUR_MS);
    if (now.getTime() - row.start.getTime() < limit) continue;
    requests += 1;
    if (wait !== null && wait <= limit) withQuote += 1;
  }
  hours.sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  const medianHours = hours.length === 0 ? null : hours.length % 2 === 1 ? hours[mid]! : (hours[mid - 1]! + hours[mid]!) / 2;
  return { requests, withQuote, medianHours: medianHours === null ? null : Math.round(medianHours * 10) / 10 };
}
