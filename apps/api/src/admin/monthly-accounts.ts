import { tierPeriodPriceEurCents, type SubscriptionTier } from "@professionisti/shared";

/**
 * Calcoli puri di Admin → Conti del mese (docs/changelog/2026-11-25-conti-del-mese.md).
 * Le stime di Stripe e delle fatture seguono il listino usato nell'analisi del
 * 25/11/2026 (analisi/punto-di-pareggio-12000-versione-profonda.md): servono a
 * dare un utile verosimile, la cifra esatta resta la quadratura con Stripe.
 */

/** Stripe su un abbonamento: carta europea 1,5% + 0,25 € e Billing 0,7%, sul totale con l'IVA. */
export function subscriptionStripeCostEurCents(grossEurCents: number): number {
  if (grossEurCents <= 0) return 0;
  return Math.round(grossEurCents * 0.022) + 25;
}

/** Stripe Connect: 2 € al mese per professionista pagato, 0,25% + 0,10 € a bonifico. */
export function connectCostEurCents(paidProfessionals: number, payments: number[]): number {
  const payouts = payments.reduce((sum, amount) => sum + Math.round(Math.max(0, amount) * 0.0025) + 10, 0);
  return paidProfessionals * 200 + payouts;
}

/** Fattura elettronica allo SdI con conservazione, a fattura. */
export const INVOICE_COST_EUR_CENTS = 15;

/** Prezzo al mese di un abbonato (l'annuale diviso 12), IVA esclusa. */
export function monthlyPriceEurCents(tier: SubscriptionTier, interval: "MONTH" | "YEAR"): number {
  const price = tierPeriodPriceEurCents(tier, interval);
  return interval === "YEAR" ? Math.round(price / 12) : price;
}

/** Inizio (compreso) e fine (esclusa) di un mese "AAAA-MM", in UTC come la pagina WhatsApp. */
export function monthRange(month: string): { from: Date; to: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error(`Mese non valido: ${month}`);
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  return { from: new Date(Date.UTC(year, index, 1)), to: new Date(Date.UTC(year, index + 1, 1)) };
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Mesi che si possono scegliere, dal più recente: gli ultimi 12, mai prima
 * del mese del lancio (§395: i numeri contano dal lancio).
 */
export function selectableMonths(now: Date, countingFrom: Date | null): string[] {
  const months: string[] = [];
  const first = countingFrom ? monthKey(new Date(countingFrom.getTime() + 12 * 60 * 60 * 1000)) : null;
  for (let i = 0; i < 12; i += 1) {
    const key = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)));
    months.push(key);
    if (first && key <= first) break;
  }
  return months;
}
