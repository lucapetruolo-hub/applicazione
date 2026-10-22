import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { assertNotPwnedPassword, isPwnedPassword } from "./pwned-password";

const sha1 = (value: string) => createHash("sha1").update(value, "utf8").digest("hex").toUpperCase();

describe("isPwnedPassword", () => {
  beforeEach(() => {
    vi.stubEnv("PWNED_PASSWORD_CHECK", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stubFetch(impl: (url: string) => Promise<unknown>) {
    const fetchMock = vi.fn(impl);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("manda solo i primi 5 caratteri dell'impronta, mai la password", async () => {
    const hash = sha1("Password1!");
    const fetchMock = stubFetch(async () => ({ ok: true, text: async () => `${hash.slice(5)}:42\r\nABC:0` }));
    expect(await isPwnedPassword("Password1!")).toBe(true);
    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(url).not.toContain("Password1!");
    expect(url).not.toContain(hash.slice(5));
  });

  it("una password non nell'elenco passa, anche se compare come riga di riempimento", async () => {
    const hash = sha1("Ciao-Mondo-2026!");
    stubFetch(async () => ({ ok: true, text: async () => `${hash.slice(5)}:0\r\n0000000000000000000000000000000000A:3` }));
    expect(await isPwnedPassword("Ciao-Mondo-2026!")).toBe(false);
  });

  it("servizio giù, lento o con errore: la password passa", async () => {
    stubFetch(async () => ({ ok: false, status: 503, text: async () => "" }));
    expect(await isPwnedPassword("Password1!")).toBe(false);
    stubFetch(async () => {
      throw new Error("timeout");
    });
    expect(await isPwnedPassword("Password1!")).toBe(false);
  });

  it("spento con PWNED_PASSWORD_CHECK=false: nessuna chiamata", async () => {
    vi.stubEnv("PWNED_PASSWORD_CHECK", "false");
    const fetchMock = stubFetch(async () => ({ ok: true, text: async () => "" }));
    expect(await isPwnedPassword("Password1!")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("assertNotPwnedPassword risponde 400 col messaggio per l'utente", async () => {
    const hash = sha1("Password1!");
    stubFetch(async () => ({ ok: true, text: async () => `${hash.slice(5)}:7` }));
    await expect(assertNotPwnedPassword("Password1!")).rejects.toBeInstanceOf(BadRequestException);
  });
});
