import { Inject, Injectable } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";

/** Quanto vale un biglietto appena emesso. */
export const TICKET_TTL_MS = 60_000;

/** `jti`: l'accesso da cui è nato il biglietto, per chiudere lo stream dopo "Esci". */
export type RealtimeTicket = { userId: string; sessionVersion: number; jti?: string };

/** Impronta del codice: nel database non finisce mai il codice da usare. */
function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

/**
 * Biglietti monouso da 60 secondi per aprire lo stream in tempo reale
 * (§293). Nel database e non in memoria (docs/changelog/2026-11-16-traffico-elevato.md):
 * con più copie dell'API il biglietto chiesto a una deve valere sull'altra.
 * L'uso è un solo `DELETE ... RETURNING`: due richieste con lo stesso
 * biglietto, anche su copie diverse, non passano entrambe.
 */
@Injectable()
export class RealtimeTickets {
  constructor(@Inject(PRISMA) private readonly prisma: Pick<PrismaClient, "realtimeTicket" | "$queryRaw">) {}

  async issue(ticket: RealtimeTicket, now = Date.now()): Promise<string> {
    // I biglietti scaduti si tolgono man mano, senza attività a orario.
    await this.prisma.realtimeTicket.deleteMany({ where: { expiresAt: { lte: new Date(now) } } });
    const code = randomBytes(24).toString("base64url");
    await this.prisma.realtimeTicket.create({
      data: { codeHash: hashCode(code), userId: ticket.userId, sessionVersion: ticket.sessionVersion, jti: ticket.jti ?? null, expiresAt: new Date(now + TICKET_TTL_MS) },
    });
    return code;
  }

  /** Il biglietto, se valido; da qui in poi non vale più. */
  async redeem(code: string, now = Date.now()): Promise<RealtimeTicket | null> {
    if (!code || code.length > 100) return null;
    const rows = await this.prisma.$queryRaw<{ userId: string; sessionVersion: number; jti: string | null; expiresAt: Date }[]>`
      DELETE FROM realtime_tickets WHERE "codeHash" = ${hashCode(code)}
      RETURNING "userId", "sessionVersion", jti, "expiresAt"`;
    const ticket = rows[0];
    if (!ticket || ticket.expiresAt.getTime() <= now) return null;
    return { userId: ticket.userId, sessionVersion: ticket.sessionVersion, ...(ticket.jti ? { jti: ticket.jti } : {}) };
  }
}
