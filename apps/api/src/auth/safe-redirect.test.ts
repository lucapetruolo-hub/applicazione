import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@professionisti/shared";

describe("safeInternalPath", () => {
  it("accetta i percorsi del sito, con query e ancora", () => {
    expect(safeInternalPath("/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/professionista/abc?salva=1#recensioni")).toBe("/professionista/abc?salva=1#recensioni");
  });

  it("rifiuta altri siti, schemi pericolosi e valori vuoti", () => {
    for (const value of [
      null,
      undefined,
      "",
      "https://esempio.com",
      "//esempio.com",
      "/\\esempio.com",
      "\\\\esempio.com",
      "javascript:alert(1)",
      "/%0a//esempio.com".replace("%0a", "\n"),
      " /dashboard",
      "dashboard",
    ]) {
      expect(safeInternalPath(value)).toBeNull();
    }
  });
});
