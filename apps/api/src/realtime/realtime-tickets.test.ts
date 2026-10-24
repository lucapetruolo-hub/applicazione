import { describe, expect, it } from "vitest";
import { RealtimeTickets, TICKET_TTL_MS } from "./realtime-tickets";

/** Biglietti dello stream in tempo reale (§293). */
describe("RealtimeTickets", () => {
  it("vale una volta sola", () => {
    const tickets = new RealtimeTickets();
    const code = tickets.issue({ userId: "u-1", sessionVersion: 2 });
    expect(tickets.redeem(code)).toEqual({ userId: "u-1", sessionVersion: 2 });
    expect(tickets.redeem(code)).toBeNull();
  });

  it("scade dopo 60 secondi", () => {
    const tickets = new RealtimeTickets();
    const code = tickets.issue({ userId: "u-1", sessionVersion: 0 }, 1_000);
    expect(tickets.redeem(code, 1_000 + TICKET_TTL_MS)).toBeNull();
  });

  it("rifiuta un codice inventato", () => {
    expect(new RealtimeTickets().redeem("inventato")).toBeNull();
  });
});
