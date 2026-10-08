import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { assertTurnstile, verifyTurnstileToken } from "./turnstile";

/**
 * Anti-bot Turnstile sulla registrazione (docs/CHANGELOG.md §199): spento
 * senza chiave, blocca token mancanti o rifiutati, non blocca le iscrizioni
 * se Cloudflare non risponde.
 */
describe("verifyTurnstileToken", () => {
  afterEach(() => {
    delete process.env.TURNSTILE_SECRET_KEY;
    vi.unstubAllGlobals();
  });

  function stubFetch(impl: () => Promise<unknown>) {
    const fetchMock = vi.fn(impl);
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("senza chiave lascia passare anche senza token, senza chiamare Cloudflare", async () => {
    const fetchMock = stubFetch(async () => ({}));
    await expect(verifyTurnstileToken(undefined, "1.2.3.4")).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con la chiave rifiuta un token mancante", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const fetchMock = stubFetch(async () => ({}));
    await expect(verifyTurnstileToken(undefined, "1.2.3.4")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accetta un token confermato da Cloudflare e invia chiave, token e IP", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    const fetchMock = stubFetch(async () => ({ ok: true, json: async () => ({ success: true }) }));
    await expect(verifyTurnstileToken("tok", "1.2.3.4")).resolves.toBe(true);
    const body = (fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("tok");
    expect(body.get("remoteip")).toBe("1.2.3.4");
  });

  it("rifiuta un token che Cloudflare dichiara non valido", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    stubFetch(async () => ({ ok: true, json: async () => ({ success: false, "error-codes": ["invalid-input-response"] }) }));
    await expect(verifyTurnstileToken("tok", undefined)).resolves.toBe(false);
  });

  it("lascia passare se Cloudflare non è raggiungibile", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    stubFetch(async () => {
      throw new Error("network down");
    });
    await expect(verifyTurnstileToken("tok", undefined)).resolves.toBe(true);
  });

  it("lascia passare se Cloudflare risponde con un errore del server", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    stubFetch(async () => ({ ok: false, status: 503 }));
    await expect(verifyTurnstileToken("tok", undefined)).resolves.toBe(true);
  });

  it("assertTurnstile risponde 400 se la verifica non passa", async () => {
    process.env.TURNSTILE_SECRET_KEY = "secret";
    stubFetch(async () => ({}));
    await expect(assertTurnstile(undefined, undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});
