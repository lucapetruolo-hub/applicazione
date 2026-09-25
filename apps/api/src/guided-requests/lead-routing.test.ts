import { describe, expect, it } from "vitest";
import { addDaytimeHours, computeLeadExpiry, leadQualityScore, selectLeadRecipients, type LeadCandidateSignals } from "./lead-routing";

// Settembre: ora legale, Roma = UTC+2.
describe("addDaytimeHours (tempo di risposta solo tra le 8 e le 21, ora italiana)", () => {
  it("di giorno scorre normalmente: 10:00 + 4h = 14:00", () => {
    expect(addDaytimeHours(new Date("2026-09-24T08:00:00Z"), 4).toISOString()).toBe("2026-09-24T12:00:00.000Z");
  });

  it("una richiesta alle 23 scade alle 12 del giorno dopo, non alle 3 di notte", () => {
    expect(addDaytimeHours(new Date("2026-09-24T21:00:00Z"), 4).toISOString()).toBe("2026-09-25T10:00:00.000Z");
  });

  it("a cavallo della sera: 19:00 + 4h = 2 ore oggi e 2 domattina → 10:00", () => {
    expect(addDaytimeHours(new Date("2026-09-24T17:00:00Z"), 4).toISOString()).toBe("2026-09-25T08:00:00.000Z");
  });

  it("in inverno (UTC+1) usa comunque l'ora italiana: 23:00 → 12:00", () => {
    expect(addDaytimeHours(new Date("2026-12-10T22:00:00Z"), 4).toISOString()).toBe("2026-12-11T11:00:00.000Z");
  });

  it("le urgenti restano 20 minuti di orologio anche di notte", () => {
    const now = new Date("2026-09-24T01:00:00Z");
    expect(computeLeadExpiry(true, now).getTime() - now.getTime()).toBe(20 * 60_000);
  });
});

function candidate(id: string, overrides: Partial<LeadCandidateSignals> = {}): LeadCandidateSignals {
  return {
    id,
    avgResponseTimeMinutes: 60,
    requestsReceived: 10,
    responsesSent: 7,
    avgRating: 4.5,
    reviewCount: 10,
    honoredAppointments: 9,
    totalAppointments: 10,
    distanceKm: 5,
    radiusKm: 20,
    availableOnPreferredDay: null,
    daysSinceLastQuote: 2,
    leadsLast7Days: 2,
    ...overrides,
  };
}

describe("leadQualityScore", () => {
  it("chi risponde prima vale di più a parità del resto", () => {
    expect(leadQualityScore(candidate("a", { avgResponseTimeMinutes: 10 }))).toBeGreaterThan(leadQualityScore(candidate("b", { avgResponseTimeMinutes: 600 })));
  });

  it("chi ha già ricevuto molte richieste in settimana scende (equità)", () => {
    expect(leadQualityScore(candidate("a", { leadsLast7Days: 0 }))).toBeGreaterThan(leadQualityScore(candidate("b", { leadsLast7Days: 15 })));
  });

  it("disponibile nel giorno chiesto batte non disponibile", () => {
    expect(leadQualityScore(candidate("a", { availableOnPreferredDay: true }))).toBeGreaterThan(leadQualityScore(candidate("b", { availableOnPreferredDay: false })));
  });

  it("un nuovo senza dati non parte da zero", () => {
    const newcomer = candidate("n", {
      avgResponseTimeMinutes: null,
      requestsReceived: 0,
      responsesSent: 0,
      avgRating: null,
      reviewCount: 0,
      honoredAppointments: 0,
      totalAppointments: 0,
      daysSinceLastQuote: null,
      leadsLast7Days: 0,
    });
    expect(leadQualityScore(newcomer)).toBeGreaterThan(0.4);
  });
});

describe("selectLeadRecipients", () => {
  const strong = ["s1", "s2", "s3", "s4", "s5", "s6"].map((id, i) => candidate(id, { avgResponseTimeMinutes: 10 + i * 20 }));
  const newcomer = candidate("new", { reviewCount: 0, avgRating: null, requestsReceived: 0, responsesSent: 0, avgResponseTimeMinutes: null, daysSinceLastQuote: null });

  it("3 per le normali, i migliori per punteggio, il resto in riserva in ordine", () => {
    const { selected, reserve } = selectLeadRecipients(strong, 3);
    expect(selected).toEqual(["s1", "s2", "s3"]);
    expect(reserve).toEqual(["s4", "s5", "s6"]);
  });

  it("5 per le urgenti", () => {
    expect(selectLeadRecipients(strong, 5).selected).toHaveLength(5);
  });

  it("riserva un posto a un professionista nuovo", () => {
    const { selected, reserve } = selectLeadRecipients([...strong, newcomer], 3, () => 0);
    expect(selected).toEqual(["s1", "s2", "new"]);
    expect(reserve[0]).toBe("s3");
  });

  it("pochi candidati: tutti selezionati, nessuna riserva", () => {
    expect(selectLeadRecipients(strong.slice(0, 2), 3)).toEqual({ selected: ["s1", "s2"], reserve: [] });
  });
});
