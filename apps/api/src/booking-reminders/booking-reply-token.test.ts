import { describe, expect, it } from "vitest";
import {
  bookingReplyToken,
  readBookingReplyToken,
} from "./booking-reply-token";

const ID = "3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f";

describe("link dei pulsanti dell'email del promemoria", () => {
  it("riporta l'appuntamento firmato", () => {
    expect(readBookingReplyToken(bookingReplyToken(ID))).toBe(ID);
  });

  it("rifiuta un link cambiato o inventato", () => {
    const token = bookingReplyToken(ID);
    const other = "3f1c2b9e-1a2b-4c3d-8e9f-0a1b2c3d4e50";
    expect(
      readBookingReplyToken(`${other}${token.slice(ID.length)}`),
    ).toBeNull();
    expect(readBookingReplyToken(`${token}x`)).toBeNull();
    expect(readBookingReplyToken(ID)).toBeNull();
    expect(readBookingReplyToken("a.b")).toBeNull();
  });
});
