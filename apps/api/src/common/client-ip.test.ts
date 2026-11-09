import { afterEach, describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

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
