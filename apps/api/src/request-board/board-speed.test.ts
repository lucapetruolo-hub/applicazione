import { describe, expect, it } from "vitest";
import { boardSpeed } from "./board-speed";

const NOW = new Date("2026-11-20T10:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const hoursAfter = (start: Date, hours: number) => new Date(start.getTime() + hours * 3_600_000);

describe("bacheca: preventivo entro 7 giorni e ore al primo", () => {
  it("conta solo le richieste partite da almeno 7 giorni, e i preventivi dopo la partenza", () => {
    const a = daysAgo(10);
    const b = daysAgo(9);
    const c = daysAgo(8);
    const fresh = daysAgo(2);
    const result = boardSpeed(
      [
        { start: a, quotes: [hoursAfter(a, 4)] },
        // Preventivo arrivato prima della bacheca: non conta.
        { start: b, quotes: [hoursAfter(b, -5)] },
        // Oltre i 7 giorni: non conta.
        { start: c, quotes: [hoursAfter(c, 8 * 24)] },
        { start: fresh, quotes: [hoursAfter(fresh, 10)] },
      ],
      NOW,
    );
    expect(result.requests).toBe(3);
    expect(result.withQuote).toBe(1);
    // Ore a metà tra 4 e 10.
    expect(result.medianHours).toBe(7);
  });

  it("senza preventivi nessuna mediana", () => {
    expect(boardSpeed([{ start: daysAgo(9), quotes: [] }], NOW)).toEqual({ requests: 1, withQuote: 0, medianHours: null });
  });
});
