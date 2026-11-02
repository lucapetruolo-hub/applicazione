import { describe, expect, it } from "vitest";
import { postgresNotice } from "./database-version.service";

/** Fine del supporto di PostgreSQL (docs/changelog/2026-10-30-admin-persone.md). */
const cycles = [
  { cycle: "18", eol: "2030-11-14" },
  { cycle: "16", eol: "2028-11-09" },
  { cycle: "13", eol: "2025-11-13" },
];
const now = new Date("2028-06-01T00:00:00Z");

describe("versione di PostgreSQL", () => {
  it("avvisa con meno di 6 mesi alla fine del supporto e indica la versione più recente", () => {
    const notice = postgresNotice(160004, cycles, now);
    expect(notice?.title).toBe("Aggiornare PostgreSQL 16 su Render");
    expect(notice?.paragraphs[0]).toContain("solo fino al 9 novembre 2028");
    expect(notice?.paragraphs[1]).toContain("la 18");
  });

  it("niente avviso con più di 6 mesi o con una versione che il calendario non conosce", () => {
    expect(postgresNotice(180001, cycles, now)).toBeNull();
    expect(postgresNotice(990000, cycles, now)).toBeNull();
  });

  it("supporto già finito: lo dice", () => {
    expect(postgresNotice(130010, cycles, now)?.paragraphs[0]).toContain("non riceve più correzioni di sicurezza");
  });
});
