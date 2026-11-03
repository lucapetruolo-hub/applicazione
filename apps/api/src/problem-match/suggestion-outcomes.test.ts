import { describe, expect, it } from "vitest";
import { suggestionOutcomes } from "./problem-match-admin.service";

describe("suggestionOutcomes", () => {
  it("conta le categorie proposte tenute e cambiate, con le sostituzioni più frequenti", () => {
    const result = suggestionOutcomes([
      { suggested: "idraulico", chosen: "idraulico", withOthers: false },
      { suggested: "idraulico", chosen: "idraulico", withOthers: true },
      { suggested: "idraulico", chosen: "tuttofare", withOthers: false },
      { suggested: "idraulico", chosen: "tuttofare", withOthers: false },
      { suggested: "elettricista", chosen: "climatizzazione", withOthers: false },
    ]);
    expect(result).toEqual({
      total: 5,
      kept: 2,
      keptWithOthers: 1,
      changed: 3,
      changes: [
        { from: "idraulico", to: "tuttofare", count: 2 },
        { from: "elettricista", to: "climatizzazione", count: 1 },
      ],
    });
  });
});
