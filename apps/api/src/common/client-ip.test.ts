import { afterEach, describe, expect, it } from "vitest";
import { clientIp, isSiteServerRequest } from "./client-ip";

describe("clientIp (controllo dell'08/11, E2-02)", () => {
  afterEach(() => {
    delete process.env.RENDER;
  });

  const req = (headers: Record<string, string>) => ({ ip: "10.0.0.7", headers });

  it("su Render usa l'indirizzo scritto da Cloudflare", () => {
    process.env.RENDER = "true";
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "198.51.100.1, 10.0.0.7" }))).toBe("203.0.113.9");
    expect(clientIp(req({ "cf-connecting-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("su Render senza intestazione valida resta req.ip, mai X-Forwarded-For", () => {
    process.env.RENDER = "true";
    expect(clientIp(req({ "x-forwarded-for": "198.51.100.1" }))).toBe("10.0.0.7");
    expect(clientIp(req({ "cf-connecting-ip": "non un indirizzo" }))).toBe("10.0.0.7");
  });

  it("fuori da Render l'intestazione non conta: chiunque potrebbe scriverla", () => {
    expect(clientIp(req({ "cf-connecting-ip": "203.0.113.9" }))).toBe("10.0.0.7");
  });
});

describe("Chiamate dal server del sito (docs/changelog/2026-11-16-traffico-elevato.md)", () => {
  const key = "k".repeat(40);
  it("riconosce solo la chiave giusta", () => {
    expect(isSiteServerRequest({ headers: { "x-site-key": key } }, key)).toBe(true);
    expect(isSiteServerRequest({ headers: { "x-site-key": `${key}x` } }, key)).toBe(false);
    expect(isSiteServerRequest({ headers: { "x-site-key": "k".repeat(39) + "j" } }, key)).toBe(false);
    expect(isSiteServerRequest({ headers: {} }, key)).toBe(false);
  });

  it("senza chiave impostata, o troppo corta, nessuna chiamata è del sito", () => {
    expect(isSiteServerRequest({ headers: { "x-site-key": "" } }, "")).toBe(false);
    expect(isSiteServerRequest({ headers: { "x-site-key": "corta" } }, "corta")).toBe(false);
    expect(isSiteServerRequest({ headers: { "x-site-key": key } }, undefined)).toBe(false);
  });
});
