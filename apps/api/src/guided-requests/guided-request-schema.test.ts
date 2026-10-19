import { describe, expect, it } from "vitest";
import { guidedRequestSchema } from "@professionisti/shared";

// Città obbligatoria in ogni richiesta generale, anche online (docs/CHANGELOG.md §210).
describe("guidedRequestSchema: città", () => {
  const online = { categorySlug: "idraulico", description: "Consulenza su un impianto", serviceMode: "ONLINE" as const };

  it("richiesta generale online senza città: rifiutata", () => {
    expect(guidedRequestSchema.safeParse(online).success).toBe(false);
  });

  it("richiesta generale online con città: accettata", () => {
    expect(guidedRequestSchema.safeParse({ ...online, city: "Latina" }).success).toBe(true);
  });

  it("consulenza online a un professionista scelto: città facoltativa", () => {
    expect(guidedRequestSchema.safeParse({ ...online, professionalProfileId: "0b6f7c1e-5d2a-4c3b-9a8e-1f2d3c4b5a69" }).success).toBe(true);
  });
});

// Più categorie in una richiesta generale (docs/CHANGELOG.md §259).
describe("guidedRequestSchema: più categorie", () => {
  const base = { categorySlug: "idraulico", description: "Rifare il bagno di casa", serviceMode: "ONLINE" as const, city: "Latina" };

  it("fino a tre categorie: accettata", () => {
    expect(guidedRequestSchema.safeParse({ ...base, extraCategorySlugs: ["elettricista", "muratore"] }).success).toBe(true);
  });

  it("più di tre categorie: rifiutata", () => {
    expect(guidedRequestSchema.safeParse({ ...base, extraCategorySlugs: ["elettricista", "muratore", "imbianchino"] }).success).toBe(false);
  });

  it("stessa categoria due volte: rifiutata", () => {
    expect(guidedRequestSchema.safeParse({ ...base, extraCategorySlugs: ["idraulico"] }).success).toBe(false);
  });

  it("richiesta a un professionista scelto: una sola categoria", () => {
    const direct = { ...base, professionalProfileId: "0b6f7c1e-5d2a-4c3b-9a8e-1f2d3c4b5a69" };
    expect(guidedRequestSchema.safeParse({ ...direct, extraCategorySlugs: ["elettricista"] }).success).toBe(false);
  });
});
