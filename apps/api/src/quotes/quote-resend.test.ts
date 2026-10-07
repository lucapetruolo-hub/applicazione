import { describe, expect, it } from "vitest";
import { quoteResendWindow } from "./quote-resend";

const now = new Date("2026-10-07T12:00:00Z");
const openRequest = { status: "MATCHED", expiresAt: new Date("2026-10-15T12:00:00Z"), hiddenAt: null };

describe("quoteResendWindow (docs/CHANGELOG.md §188)", () => {
  it("permette un nuovo preventivo fino alla scadenza della richiesta, contata dal suo invio", () => {
    expect(quoteResendWindow({ quoteStatus: "REJECTED", hasBooking: false, request: openRequest, clientDeleted: false }, now)).toEqual({
      canResend: true,
      resendUntil: openRequest.expiresAt,
    });
  });

  it("niente nuovo preventivo a richiesta scaduta, chiusa, nascosta o con cliente eliminato", () => {
    const base = { quoteStatus: "REJECTED", hasBooking: false, clientDeleted: false };
    expect(quoteResendWindow({ ...base, request: { ...openRequest, expiresAt: new Date("2026-10-07T11:59:00Z") } }, now).canResend).toBe(false);
    expect(quoteResendWindow({ ...base, request: { ...openRequest, status: "CLOSED" } }, now).canResend).toBe(false);
    expect(quoteResendWindow({ ...base, request: { ...openRequest, hiddenAt: now } }, now).canResend).toBe(false);
    expect(quoteResendWindow({ ...base, clientDeleted: true, request: openRequest }, now).canResend).toBe(false);
  });

  it("solo per un preventivo rifiutato dal cliente", () => {
    for (const quoteStatus of ["SENT", "ACCEPTED", "WITHDRAWN", "MODIFICATION_REQUESTED"]) {
      expect(quoteResendWindow({ quoteStatus, hasBooking: false, request: openRequest, clientDeleted: false }, now).canResend).toBe(false);
    }
  });

  it("una richiesta senza scadenza (precedente alla funzionalità) resta aperta senza data limite", () => {
    expect(
      quoteResendWindow({ quoteStatus: "REJECTED", hasBooking: false, request: { ...openRequest, expiresAt: null }, clientDeleted: false }, now),
    ).toEqual({ canResend: true, resendUntil: null });
  });
});
