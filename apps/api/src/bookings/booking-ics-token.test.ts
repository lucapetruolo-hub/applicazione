import { describe, expect, it } from "vitest";
import { bookingIcsExpiry, bookingIcsToken, readBookingIcsToken } from "./booking-ics-token";

const ID = "3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";
const DAY = 24 * 60 * 60_000;

describe("link del file .ics di Altri calendari", () => {
  it("riporta lavoro e destinatario firmati", () => {
    const exp = Date.now() + DAY;
    expect(readBookingIcsToken(bookingIcsToken(ID, "client", exp))).toEqual({ bookingId: ID, role: "client" });
    expect(readBookingIcsToken(bookingIcsToken(ID, "professional", exp))).toEqual({ bookingId: ID, role: "professional" });
  });

  it("scade: un mese dopo l'appuntamento, mai meno di un giorno da adesso", () => {
    const now = Date.now();
    expect(bookingIcsExpiry(new Date(now + 3 * DAY), now)).toBe(now + 33 * DAY);
    expect(bookingIcsExpiry(new Date(now - 60 * DAY), now)).toBe(now + DAY);
    const token = bookingIcsToken(ID, "client", now + DAY);
    expect(readBookingIcsToken(token, now + DAY - 60_000)).not.toBeNull();
    expect(readBookingIcsToken(token, now + DAY + 1000)).toBeNull();
  });

  it("rifiuta un link cambiato o inventato", () => {
    const token = bookingIcsToken(ID, "client", Date.now() + DAY);
    const other = "3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e50";
    expect(readBookingIcsToken(`${other}${token.slice(ID.length)}`)).toBeNull();
    const [id, , exp, sig] = token.split(".");
    // Il file del professionista ha il telefono del cliente: il destinatario non si cambia.
    expect(readBookingIcsToken(`${id}.p.${exp}.${sig}`)).toBeNull();
    expect(readBookingIcsToken(`${id}.c.99999999999.${sig}`)).toBeNull();
    expect(readBookingIcsToken(`${token}x`)).toBeNull();
    expect(readBookingIcsToken(ID)).toBeNull();
    expect(readBookingIcsToken("a.b.c.d")).toBeNull();
  });
});
