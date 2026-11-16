import { describe, expect, it } from "vitest";
import { RealtimeTickets, TICKET_TTL_MS } from "./realtime-tickets";

/** Database finto con lo stesso comportamento della tabella `realtime_tickets`. */
function fakePrisma() {
  const rows = new Map<string, { codeHash: string; userId: string; sessionVersion: number; jti: string | null; expiresAt: Date }>();
  return {
    rows,
    realtimeTicket: {
      create: async ({ data }: { data: { codeHash: string; userId: string; sessionVersion: number; jti: string | null; expiresAt: Date } }) => {
        rows.set(data.codeHash, data);
        return data;
      },
      deleteMany: async ({ where }: { where: { expiresAt: { lte: Date } } }) => {
        for (const [key, row] of rows) if (row.expiresAt <= where.expiresAt.lte) rows.delete(key);
        return { count: 0 };
      },
    },
    $queryRaw: async (_strings: TemplateStringsArray, hash: string) => {
      const row = rows.get(hash);
      rows.delete(hash);
      return row ? [row] : [];
    },
  };
}

/** Biglietti dello stream in tempo reale (§293), nel database (docs/changelog/2026-11-16-traffico-elevato.md). */
describe("RealtimeTickets", () => {
  it("vale una volta sola, anche da un'altra copia dell'API", async () => {
    const prisma = fakePrisma();
    const code = await new RealtimeTickets(prisma as never).issue({ userId: "u-1", sessionVersion: 2 });
    const other = new RealtimeTickets(prisma as never);
    expect(await other.redeem(code)).toEqual({ userId: "u-1", sessionVersion: 2 });
    expect(await other.redeem(code)).toBeNull();
  });

  it("nel database solo l'impronta del codice", async () => {
    const prisma = fakePrisma();
    const code = await new RealtimeTickets(prisma as never).issue({ userId: "u-1", sessionVersion: 0, jti: "s-1" });
    expect([...prisma.rows.keys()][0]).not.toContain(code);
    expect(await new RealtimeTickets(prisma as never).redeem(code)).toEqual({ userId: "u-1", sessionVersion: 0, jti: "s-1" });
  });

  it("scade dopo 60 secondi", async () => {
    const tickets = new RealtimeTickets(fakePrisma() as never);
    const code = await tickets.issue({ userId: "u-1", sessionVersion: 0 }, 1_000);
    expect(await tickets.redeem(code, 1_000 + TICKET_TTL_MS)).toBeNull();
  });

  it("rifiuta un codice inventato", async () => {
    expect(await new RealtimeTickets(fakePrisma() as never).redeem("inventato")).toBeNull();
  });
});
