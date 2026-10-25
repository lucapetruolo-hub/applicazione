import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import { reviewSummariesFor, summarizeReviews } from "./review-summary";

/** Stelle e numero di recensioni nelle schede del cliente (docs/CHANGELOG.md §339). */
describe("summarizeReviews", () => {
  it("senza recensioni non c'è media", () => {
    expect(summarizeReviews([])).toEqual({ rating: null, count: 0 });
  });

  it("media con una cifra decimale", () => {
    expect(summarizeReviews([5, 4, 5])).toEqual({ rating: 4.7, count: 3 });
  });
});

describe("reviewSummariesFor", () => {
  it("una sola query per tutti i professionisti, recensioni nascoste escluse", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { rating: 5, booking: { professionalProfileId: "pro-1" } },
      { rating: 4, booking: { professionalProfileId: "pro-1" } },
    ]);
    const prisma = { review: { findMany } } as unknown as PrismaClient;

    const summaries = await reviewSummariesFor(prisma, ["pro-1", "pro-2", "pro-1"]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0]?.[0].where).toEqual({ hiddenAt: null, booking: { professionalProfileId: { in: ["pro-1", "pro-2"] } } });
    expect(summaries.get("pro-1")).toEqual({ rating: 4.5, count: 2 });
    expect(summaries.get("pro-2")).toEqual({ rating: null, count: 0 });
  });

  it("nessuna query senza professionisti", async () => {
    const findMany = vi.fn();
    await reviewSummariesFor({ review: { findMany } } as unknown as PrismaClient, []);
    expect(findMany).not.toHaveBeenCalled();
  });
});
