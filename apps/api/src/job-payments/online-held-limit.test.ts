import { describe, expect, it, vi } from "vitest";
import { ONLINE_HELD_LIMIT_EUR_CENTS, onlineHeldLimitProblem } from "@professionisti/shared";
import { professionalHeldEurCents } from "./online-limit";

/** Professionisti nuovi: al massimo 3.000 € online fermi in tutto (collaudo P-02). */
describe("tetto dei soldi fermi per i professionisti nuovi", () => {
  it("conta solo i soldi pagati e non sbloccati, meno i rimborsi", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { paidEurCents: 100_000, refundedEurCents: 0 },
      { paidEurCents: 50_000, refundedEurCents: 20_000 },
    ]);
    expect(await professionalHeldEurCents({ jobPayment: { findMany } } as never, "pro-1")).toBe(130_000);
    expect(findMany.mock.calls[0]?.[0].where).toMatchObject({ paymentMethod: "MANOVIA", releasedAt: null });
  });

  it("blocca l'acconto che supera i 3.000 €, solo finché vale il tetto", () => {
    expect(ONLINE_HELD_LIMIT_EUR_CENTS).toBe(300_000);
    expect(onlineHeldLimitProblem({ limitEurCents: 200_000, heldEurCents: 250_000, amountEurCents: 50_000 })).toBeNull();
    expect(onlineHeldLimitProblem({ limitEurCents: 200_000, heldEurCents: 250_000, amountEurCents: 50_001 })).toMatch(/pagamento diretto/);
    expect(onlineHeldLimitProblem({ limitEurCents: null, heldEurCents: 900_000, amountEurCents: 100_000 })).toBeNull();
  });
});
