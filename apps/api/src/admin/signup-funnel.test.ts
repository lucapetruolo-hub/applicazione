import { describe, expect, it } from "vitest";
import { buildSignupFunnel, signupFunnelSql, type SignupFunnelRow } from "./signup-funnel";

const row = (week: string, values: Partial<Record<Exclude<keyof SignupFunnelRow, "week_start">, number>>): SignupFunnelRow => {
  const n = (v?: number) => BigInt(v ?? 0);
  return {
    week_start: new Date(`${week}T00:00:00Z`),
    account: n(values.account),
    email: n(values.email),
    profile: n(values.profile),
    card: n(values.card),
    card_24h: n(values.card_24h),
    card_7d: n(values.card_7d),
    fiscal: n(values.fiscal),
    identity: n(values.identity),
    payments: n(values.payments),
  };
};

describe("imbuto dell'iscrizione (docs/changelog/2026-10-30-iscrizione-carta-solida.md)", () => {
  it("settimane e totale dai conteggi della query", () => {
    const funnel = buildSignupFunnel(
      [row("2026-10-26", { account: 4, email: 3, profile: 3, card: 2, card_24h: 1, card_7d: 2, fiscal: 1, identity: 1, payments: 1 }), row("2026-10-19", { account: 1 })],
      null,
    );
    expect(funnel.weeks.map((w) => w.weekStart)).toEqual(["2026-10-26", "2026-10-19"]);
    expect(funnel.weeks[0]!.counts).toEqual({ ACCOUNT: 4, EMAIL: 3, PROFILE: 3, CARD: 2, FISCAL: 1, IDENTITY: 1, PAYMENTS: 1 });
    expect(funnel.total.counts.ACCOUNT).toBe(5);
    expect(funnel.total.cardWithin24h).toBe(1);
    expect(funnel.total.cardWithin7d).toBe(2);
    expect(funnel.countingFrom).toBeNull();
  });

  it("la query esclude gli account di prova e parte dal lancio se è più recente di 12 settimane", () => {
    const now = new Date("2026-12-01T12:00:00Z");
    const launch = new Date("2026-11-15T23:00:00Z");
    const sql = signupFunnelSql(launch, now);
    expect(sql.sql).toContain('"testAccountAt" IS NULL');
    expect(sql.sql).toContain("Europe/Rome");
    expect(sql.values).toEqual([launch]);
  });
});
