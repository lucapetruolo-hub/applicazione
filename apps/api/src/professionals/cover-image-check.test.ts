import { afterEach, describe, expect, it, vi } from "vitest";
import { CoverImageCheckService, coverRejectedMessage } from "./cover-image-check";

describe("controllo della copertina (docs/changelog/2026-11-13-copertina-profilo.md)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("senza chiave in produzione nessuna copertina passa senza controllo", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(await new CoverImageCheckService().check(Buffer.from("x"), "image/jpeg")).toBe("non-controllata");
  });

  it("senza chiave in locale si carica lo stesso", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("NODE_ENV", "test");
    expect(await new CoverImageCheckService().check(Buffer.from("x"), "image/jpeg")).toBe("ok");
  });

  it("con la chiave decide l'IA", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "chiave");
    const service = new CoverImageCheckService();
    service.ask = async () => "contatti";
    expect(await service.check(Buffer.from("x"), "image/png")).toBe("contatti");
  });

  it("il messaggio dice cosa togliere", () => {
    expect(coverRejectedMessage("contatti")).toMatch(/contatto/);
    expect(coverRejectedMessage("non-controllata")).toMatch(/Riprova/);
  });
});
