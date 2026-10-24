import { Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";

/** Quanto vale un biglietto appena emesso. */
export const TICKET_TTL_MS = 60_000;

export type RealtimeTicket = { userId: string; sessionVersion: number };

/**
 * Biglietti monouso per aprire lo stream in tempo reale (docs/CHANGELOG.md
 * §293). `EventSource` non può mandare l'header `Authorization`, quindi
 * qualcosa deve passare nell'indirizzo: prima era il token di accesso
 * (30 giorni), che poteva finire nei log. Ora è un codice casuale che vale
 * 60 secondi e una volta sola, inutile a chi lo ritrova in un log. In
 * memoria come `RealtimeService`: un solo servizio Render.
 */
@Injectable()
export class RealtimeTickets {
  private readonly tickets = new Map<string, RealtimeTicket & { expiresAt: number }>();

  issue(ticket: RealtimeTicket, now = Date.now()): string {
    this.sweep(now);
    const code = randomBytes(24).toString("base64url");
    this.tickets.set(code, { ...ticket, expiresAt: now + TICKET_TTL_MS });
    return code;
  }

  /** Il biglietto, se valido; da qui in poi non vale più. */
  redeem(code: string, now = Date.now()): RealtimeTicket | null {
    const ticket = this.tickets.get(code);
    if (!ticket) return null;
    this.tickets.delete(code);
    if (ticket.expiresAt <= now) return null;
    return { userId: ticket.userId, sessionVersion: ticket.sessionVersion };
  }

  private sweep(now: number): void {
    for (const [code, ticket] of this.tickets) if (ticket.expiresAt <= now) this.tickets.delete(code);
  }
}
