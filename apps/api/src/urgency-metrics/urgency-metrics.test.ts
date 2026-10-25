import { describe, expect, it } from "vitest";
import { computeUrgencyMetrics, type UrgencySample } from "./urgency-metrics";

/** Numeri delle richieste urgenti e avvisi (docs/CHANGELOG.md §342). */
const since = new Date("2026-11-02T08:00:00Z");
const until = new Date("2026-11-09T08:00:00Z");

function sample(isUrgent: boolean, minutesToQuote: number | null, leads = 3): UrgencySample {
  const createdAt = new Date("2026-11-03T10:00:00Z");
  return { isUrgent, createdAt, leads, firstQuoteAt: minutesToQuote === null ? null : new Date(createdAt.getTime() + minutesToQuote * 60_000) };
}

const repeat = (count: number, make: () => UrgencySample) => Array.from({ length: count }, make);

describe("computeUrgencyMetrics", () => {
  it("calcola quota, mediane e urgenti senza destinatari", () => {
    const metrics = computeUrgencyMetrics([sample(true, 20), sample(true, null, 0), sample(false, 300), sample(false, 100)], since, until);
    expect(metrics).toMatchObject({
      requests: 4,
      urgent: 2,
      urgentShare: 0.5,
      urgentMedianMinutesToFirstQuote: 20,
      standardMedianMinutesToFirstQuote: 200,
      urgentWithoutRecipients: 1,
    });
  });

  it("con poche richieste non avvisa, anche fuori soglia", () => {
    expect(computeUrgencyMetrics([sample(true, 500), sample(false, 10)], since, until).alerts).toEqual([]);
  });

  it("avvisa se le urgenti superano il 30%", () => {
    const metrics = computeUrgencyMetrics([...repeat(7, () => sample(true, 30)), ...repeat(13, () => sample(false, 240))], since, until);
    expect(metrics.alerts).toHaveLength(1);
    expect(metrics.alerts[0]).toContain("35%");
  });

  it("avvisa se le urgenti non ricevono il primo preventivo prima delle normali", () => {
    const metrics = computeUrgencyMetrics([...repeat(4, () => sample(true, 300)), ...repeat(16, () => sample(false, 120))], since, until);
    expect(metrics.alerts).toEqual(["Le urgenti non ricevono il primo preventivo prima delle normali: 300 minuti contro 120."]);
  });

  it("nessun avviso quando tutto va come previsto", () => {
    const metrics = computeUrgencyMetrics([...repeat(4, () => sample(true, 15)), ...repeat(16, () => sample(false, 180))], since, until);
    expect(metrics.alerts).toEqual([]);
  });
});
