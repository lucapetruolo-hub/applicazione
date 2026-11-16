import { describe, expect, it } from "vitest";
import { withPoolDefaults } from "@professionisti/database";

describe("Connessioni al database per copia dell'API (docs/changelog/2026-11-16-traffico-elevato.md)", () => {
  it("aggiunge 10 connessioni e 20 secondi di attesa se mancano", () => {
    const url = new URL(withPoolDefaults("postgresql://u:p@host:5432/db?schema=public")!);
    expect(url.searchParams.get("connection_limit")).toBe("10");
    expect(url.searchParams.get("pool_timeout")).toBe("20");
    expect(url.searchParams.get("schema")).toBe("public");
  });

  it("un valore già scritto nell'indirizzo vince", () => {
    const url = new URL(withPoolDefaults("postgresql://u:p@host/db?connection_limit=3")!);
    expect(url.searchParams.get("connection_limit")).toBe("3");
  });

  it("senza indirizzo, o con uno non leggibile, non cambia nulla", () => {
    expect(withPoolDefaults(undefined)).toBeUndefined();
    expect(withPoolDefaults("non un indirizzo")).toBe("non un indirizzo");
  });
});
