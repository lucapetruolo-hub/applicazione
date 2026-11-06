import { describe, expect, it } from "vitest";
import { canonicalServiceName } from "@professionisti/shared";
import { problemServiceField } from "./professionals.service";
import { serviceGroupKey } from "./service-group-key";

// docs/changelog/2026-11-06-ia-conosce-i-servizi.md
describe("problemServiceField", () => {
  const services = [
    { id: "a", name: "Sostituzione rubinetteria" },
    { id: "b", name: "Ricerca perdite e infiltrazioni" },
  ];

  it("con la prestazione scelta dall'IA mette in evidenza quella, anche senza parole in comune", () => {
    const chosen = { key: serviceGroupKey("Ricerca perdite e infiltrazioni"), canonicalize: canonicalServiceName };
    expect(problemServiceField(services, "il bagno allaga il piano di sotto", chosen)).toEqual({ matchedServiceId: "b" });
  });

  it("se il professionista non ce l'ha restano le parole uguali", () => {
    const chosen = { key: serviceGroupKey("Sturatura scarichi"), canonicalize: canonicalServiceName };
    expect(problemServiceField(services, "il rubinetto gocciola", chosen)).toEqual({ matchedServiceId: "a" });
    expect(problemServiceField(services, "il rubinetto gocciola", null)).toEqual({ matchedServiceId: "a" });
  });
});
