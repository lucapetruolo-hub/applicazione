import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { professionalKindOf } from "@professionisti/shared";
import { publicVerified } from "../professional-fiscal/public-visibility";

/**
 * Il sito dice "Badge Verificato: identità controllata con documento e
 * selfie" (docs/CHANGELOG.md §331). Questa prova lo tiene vero: nel codice
 * c'è un solo punto che accende il badge, la verifica di documento e selfie
 * (`markVerifiedByProvider`, chiamata solo con esito approvato e documento
 * della persona dei dati fiscali, vedi identity-verification.test.ts), e un
 * profilo dimostrativo non lo mostra mai ai clienti.
 */
const SRC = join(__dirname, "..");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".ts") && !name.endsWith(".test.ts") && !name.endsWith(".spec.ts") ? [path] : [];
  });
}

describe("badge Verificato solo con verifica approvata", () => {
  it("un solo punto del codice scrive verified: true, quello della verifica con documento e selfie", () => {
    const writers = sources(SRC).flatMap((file) => {
      const text = readFileSync(file, "utf8");
      // Scritture Prisma (`data: { ... verified: true ... }`), non le select.
      return [...text.matchAll(/data:\s*\{[^{}]*\bverified:\s*true\b/g)].map(() => relative(SRC, file));
    });
    expect(writers).toEqual(["professional-verification/professional-verification.service.ts"]);
    const service = readFileSync(join(SRC, "professional-verification/professional-verification.service.ts"), "utf8");
    // …e dentro markVerifiedByProvider, non in un altro metodo dello stesso file.
    const start = service.indexOf("async markVerifiedByProvider");
    const end = service.indexOf("\n  async ", start + 1);
    expect(service.slice(start, end)).toMatch(/data:\s*\{[^{}]*\bverified:\s*true\b/);
  });

  it("solo la verifica approvata chiama markVerifiedByProvider", () => {
    const callers = sources(SRC).filter((file) => readFileSync(file, "utf8").includes(".markVerifiedByProvider("));
    expect(callers.map((file) => relative(SRC, file))).toEqual(["identity-verification/identity-verification.service.ts"]);
  });

  it("un profilo dimostrativo non mostra mai il badge ai clienti", () => {
    expect(publicVerified({ verified: true, isDemo: true })).toBe(false);
    expect(publicVerified({ verified: true, isDemo: false })).toBe(true);
    expect(publicVerified({ verified: false, isDemo: false })).toBe(false);
  });
});

describe("badge Privato / Partita IVA / Azienda", () => {
  it("segue il tipo scelto nei dati fiscali, nessun badge senza tipo", () => {
    expect(professionalKindOf("PRIVATE_INDIVIDUAL")).toBe("PRIVATE");
    expect(professionalKindOf("SOLE_PROPRIETOR")).toBe("VAT");
    expect(professionalKindOf("BUSINESS")).toBe("BUSINESS");
    expect(professionalKindOf(null)).toBeNull();
  });
});
