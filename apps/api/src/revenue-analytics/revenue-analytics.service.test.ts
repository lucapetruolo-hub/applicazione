import { describe, expect, it } from "vitest";
import { bucketStatsRows } from "./revenue-analytics.service";

const d = (iso: string) => new Date(iso);
const emptyRows = { views: [], requests: [], quotes: [], won: [], completed: [], reviews: [] };

describe("bucketStatsRows", () => {
  it("crea un giorno per ogni data del periodo, anche a zero, e somma nel giorno giusto", () => {
    const buckets = bucketStatsRows(
      {
        ...emptyRows,
        views: [{ day: d("2026-09-02T00:00:00Z"), count: 5 }],
        requests: [{ createdAt: d("2026-09-02T10:00:00Z") }, { createdAt: d("2026-09-03T23:59:00Z") }],
        completed: [{ updatedAt: d("2026-09-01T08:00:00Z"), finalAmountEurCents: 12000 }, { updatedAt: d("2026-09-01T09:00:00Z"), finalAmountEurCents: null }],
      },
      d("2026-09-01T00:00:00Z"),
      d("2026-09-03T00:00:00Z"),
      "day",
    );
    expect(buckets.map((b) => b.key)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    expect(buckets[0]).toMatchObject({ completed: 2, revenueEurCents: 12000, label: "1 Set" });
    expect(buckets[1]).toMatchObject({ views: 5, requests: 1 });
    expect(buckets[2]).toMatchObject({ requests: 1 });
  });

  it("raggruppa per mese su periodi lunghi, compreso il mese di inizio a metà", () => {
    const buckets = bucketStatsRows(
      { ...emptyRows, quotes: [{ createdAt: d("2026-07-20T00:00:00Z") }, { createdAt: d("2026-09-10T00:00:00Z") }] },
      d("2026-07-15T00:00:00Z"),
      d("2026-09-24T00:00:00Z"),
      "month",
    );
    expect(buckets.map((b) => b.key)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(buckets.map((b) => b.quotes)).toEqual([1, 0, 1]);
  });
});
