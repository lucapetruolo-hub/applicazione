import { describe, expect, it } from "vitest";
import { BOOKING_ICS_TTL_MS, bookingIcsToken, readBookingIcsToken } from "./booking-ics-token";

const ID = "3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

describe("link del file .ics di Aggiungi al calendario", () => {
  it("riporta il lavoro firmato", () => {
    expect(readBookingIcsToken(bookingIcsToken(ID))).toBe(ID);
  });

  it("scade dopo un giorno", () => {
    const now = Date.now();
    const token = bookingIcsToken(ID, now);
    expect(readBookingIcsToken(token, now + BOOKING_ICS_TTL_MS - 60_000)).toBe(ID);
    expect(readBookingIcsToken(token, now + BOOKING_ICS_TTL_MS + 1000)).toBeNull();
  });

  it("rifiuta un link cambiato o inventato", () => {
    const token = bookingIcsToken(ID);
    const other = "3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e50";
    expect(readBookingIcsToken(`${other}${token.slice(ID.length)}`)).toBeNull();
    const [id, , sig] = token.split(".");
    expect(readBookingIcsToken(`${id}.99999999999.${sig}`)).toBeNull();
    expect(readBookingIcsToken(`${token}x`)).toBeNull();
    expect(readBookingIcsToken(ID)).toBeNull();
    expect(readBookingIcsToken("a.b.c")).toBeNull();
  });
});
