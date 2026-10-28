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

// Da 2 a 5 professionisti scelti dai risultati (docs/CHANGELOG.md §390).
describe("guidedRequestSchema: professionisti scelti", () => {
  const base = { categorySlug: "idraulico", description: "Rifare il bagno di casa", serviceMode: "ONLINE" as const, city: "Latina" };
  const id = (n: number) => `0b6f7c1e-5d2a-4c3b-9a8e-1f2d3c4b5a6${n}`;

  it("da 2 a 5: accettata", () => {
    expect(guidedRequestSchema.safeParse({ ...base, professionalProfileIds: [id(1), id(2)] }).success).toBe(true);
    expect(guidedRequestSchema.safeParse({ ...base, professionalProfileIds: [1, 2, 3, 4, 5].map(id) }).success).toBe(true);
  });

  it("uno solo o più di 5: rifiutata", () => {
    expect(guidedRequestSchema.safeParse({ ...base, professionalProfileIds: [id(1)] }).success).toBe(false);
    expect(guidedRequestSchema.safeParse({ ...base, professionalProfileIds: [1, 2, 3, 4, 5, 6].map(id) }).success).toBe(false);
  });

  it("lo stesso professionista due volte: rifiutata", () => {
    expect(guidedRequestSchema.safeParse({ ...base, professionalProfileIds: [id(1), id(1)] }).success).toBe(false);
  });

  it("mai insieme a un professionista singolo o ad altre categorie", () => {
    const chosen = { ...base, professionalProfileIds: [id(1), id(2)] };
    expect(guidedRequestSchema.safeParse({ ...chosen, professionalProfileId: id(3) }).success).toBe(false);
    expect(guidedRequestSchema.safeParse({ ...chosen, extraCategorySlugs: ["elettricista"] }).success).toBe(false);
  });
});
