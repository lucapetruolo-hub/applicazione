import { describe, expect, it } from "vitest";
import { multiTradeOutcomes } from "./problem-match-admin.service";

describe("multiTradeOutcomes", () => {
  it("conta gli invii a più mestieri e i preventivi del primo e degli altri", () => {
    const result = multiTradeOutcomes([
      // Invio 1: il primo mestiere 2 preventivi, il secondo 1.
      { submissionGroupId: "a", quotes: 2 },
      { submissionGroupId: "a", quotes: 1 },
      // Invio 2: risponde solo il secondo mestiere.
      { submissionGroupId: "b", quotes: 0 },
      { submissionGroupId: "b", quotes: 3 },
      { submissionGroupId: "b", quotes: 0 },
      // Una sola richiesta rimasta nel gruppo (l'altra cancellata): non conta.
      { submissionGroupId: "c", quotes: 4 },
    ]);
    expect(result).toEqual({ sends: 2, quotesFirst: 2, quotesOthers: 4, onlyOthers: 1 });
  });
});
