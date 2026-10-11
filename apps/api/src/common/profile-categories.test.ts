import { describe, expect, it } from "vitest";
import { professionalProfileSelfSchema, registerSchema } from "@professionisti/shared";
import { profileCategories } from "./profile-categories.util";

// Fino a 3 categorie per professionista (docs/CHANGELOG.md §214).
describe("categorie del professionista", () => {
  const profile = {
    businessName: "Idraulica Rossi",
    city: "Roma",
    services: [],
    portfolioUrls: [],
    spokenLanguages: ["Italiano"],
  };
  const registration = { email: "mario@esempio.it", password: "password1", acceptedLegalTerms: true, declaredAdult: true };

  it("il profilo accetta da 1 a 3 categorie, mai doppie", () => {
    expect(professionalProfileSelfSchema.safeParse({ ...profile, categorySlugs: ["idraulico"] }).success).toBe(true);
    expect(professionalProfileSelfSchema.safeParse({ ...profile, categorySlugs: ["idraulico", "fabbro", "elettricista"] }).success).toBe(true);
    expect(professionalProfileSelfSchema.safeParse({ ...profile, categorySlugs: [] }).success).toBe(false);
    expect(professionalProfileSelfSchema.safeParse({ ...profile, categorySlugs: ["idraulico", "fabbro", "elettricista", "pulizie"] }).success).toBe(false);
    expect(professionalProfileSelfSchema.safeParse({ ...profile, categorySlugs: ["idraulico", "idraulico"] }).success).toBe(false);
    expect(professionalProfileSelfSchema.safeParse({ ...profile, categorySlugs: ["inventata"] }).success).toBe(false);
  });

  it("in registrazione il professionista sceglie almeno una categoria, il cliente nessuna", () => {
    expect(registerSchema.safeParse({ ...registration, role: "PROFESSIONAL" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...registration, role: "PROFESSIONAL", categorySlugs: ["idraulico"] }).success).toBe(true);
    expect(registerSchema.safeParse({ ...registration, role: "PROFESSIONAL", categorySlugs: ["idraulico", "fabbro", "elettricista", "pulizie"] }).success).toBe(false);
    expect(registerSchema.safeParse({ ...registration, role: "CLIENT" }).success).toBe(true);
  });

  it("la principale resta prima, le aggiuntive seguono l'ordine del sito", () => {
    const result = profileCategories({
      category: { slug: "fabbro", label: "Fabbro" },
      extraCategories: [
        { slug: "pulizie", label: "Pulizie" },
        { slug: "idraulico", label: "Idraulico" },
      ],
    });
    expect(result.map((category) => category.slug)).toEqual(["fabbro", "idraulico", "pulizie"]);
  });
});
