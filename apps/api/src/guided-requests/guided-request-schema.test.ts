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
