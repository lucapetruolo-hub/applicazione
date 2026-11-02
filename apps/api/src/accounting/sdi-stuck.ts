import type { Prisma } from "@professionisti/database";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Lo SdI dà l'esito entro 5 giorni: dopo, una fattura "inviata" senza esito è ferma. */
const SDI_STUCK_SENT_DAYS = 5;

/**
 * Fatture ferme allo SdI (docs/changelog/2026-11-02-admin-protezioni.md): non
 * partite dopo un giorno di tentativi (uno all'ora) o inviate da più di 5 giorni
 * senza esito. Le scartate hanno già il loro avviso e la loro riga in "Da fare".
 */
export function stuckSdiWhere(now: Date): Prisma.InvoiceWhereInput {
  return {
    OR: [
      { sdiStatus: "NOT_SENT", xml: { not: null }, issuedAt: { lt: new Date(now.getTime() - DAY_MS) } },
      { sdiStatus: "SENT", sdiSentAt: { lt: new Date(now.getTime() - SDI_STUCK_SENT_DAYS * DAY_MS) } },
    ],
  };
}
