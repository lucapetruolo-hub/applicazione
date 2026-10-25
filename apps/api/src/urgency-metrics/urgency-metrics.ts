import { URGENCY_METRICS_MIN_REQUESTS, URGENT_SHARE_ALERT, type UrgencyMetrics } from "@professionisti/shared";

export type UrgencySample = {
  isUrgent: boolean;
  createdAt: Date;
  leads: number;
  firstQuoteAt: Date | null;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

const minutesToFirstQuote = (samples: UrgencySample[]) =>
  samples.flatMap((s) => (s.firstQuoteAt ? [Math.round((s.firstQuoteAt.getTime() - s.createdAt.getTime()) / 60_000)] : []));

/**
 * Numeri della settimana e avvisi (docs/CHANGELOG.md §340). Avvisi solo con
 * almeno URGENCY_METRICS_MIN_REQUESTS richieste: con pochi numeri una sola
 * richiesta sposta tutto.
 */
export function computeUrgencyMetrics(samples: UrgencySample[], since: Date, until: Date): UrgencyMetrics {
  const urgent = samples.filter((s) => s.isUrgent);
  const standard = samples.filter((s) => !s.isUrgent);
  const urgentShare = samples.length ? urgent.length / samples.length : null;
  const urgentMedian = median(minutesToFirstQuote(urgent));
  const standardMedian = median(minutesToFirstQuote(standard));
  const urgentWithoutRecipients = urgent.filter((s) => s.leads === 0).length;

  const alerts: string[] = [];
  if (samples.length >= URGENCY_METRICS_MIN_REQUESTS) {
    if (urgentShare !== null && urgentShare > URGENT_SHARE_ALERT) {
      alerts.push(`Le richieste urgenti sono il ${Math.round(urgentShare * 100)}% (soglia ${Math.round(URGENT_SHARE_ALERT * 100)}%).`);
    }
    if (urgentMedian !== null && standardMedian !== null && urgentMedian >= standardMedian) {
      alerts.push(`Le urgenti non ricevono il primo preventivo prima delle normali: ${urgentMedian} minuti contro ${standardMedian}.`);
    }
  }
  return {
    since: since.toISOString(),
    until: until.toISOString(),
    requests: samples.length,
    urgent: urgent.length,
    urgentShare,
    urgentMedianMinutesToFirstQuote: urgentMedian,
    standardMedianMinutesToFirstQuote: standardMedian,
    urgentWithoutRecipients,
    alerts,
  };
}
