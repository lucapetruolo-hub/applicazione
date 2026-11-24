import { describe, expect, it, vi } from "vitest";
import { InvoicesService, monthSdiChain, sdiRejectedAlerts, sdiResendBy } from "./invoices.service";
import { sdiOutcomeFromNotifications, sdiRejectionHint } from "./sdi-provider";
import { invoicePdfModel } from "./document-pdf-models";

describe("Scarti dello SdI", () => {
  it("il termine è 5 giorni dalla notifica di scarto", () => {
    expect(sdiResendBy(new Date("2026-12-03T10:00:00Z")).toISOString()).toBe("2026-12-08T10:00:00.000Z");
  });

  it("l'avviso dice motivo, cosa fare, termine e che numero e data restano", () => {
    const alerts = sdiRejectedAlerts("COM/2026/0007", "00305: IdFiscaleIVA del CessionarioCommittente non valido", new Date("2026-12-08T10:00:00Z"));
    expect(alerts[0]).toContain("COM/2026/0007");
    expect(alerts[1]).toContain("partita IVA del professionista");
    expect(alerts[2]).toContain("entro il 08/12/2026");
    expect(alerts[2]).toContain("stesso numero e la stessa data");
  });

  it("codice sconosciuto: niente consiglio inventato", () => {
    expect(sdiRejectionHint("00999: altro")).toBeNull();
    expect(sdiRejectionHint(null)).toBeNull();
    expect(sdiRejectionHint("00404: Fattura duplicata")).toContain("doppione");
  });

  it("MC è emessa ma non consegnata, RC no", () => {
    const mc = sdiOutcomeFromNotifications("u", { data: [{ type: "MC", created_at: "2026-12-01T10:00:00Z" }] });
    expect(mc).toMatchObject({ status: "DELIVERED", undelivered: true });
    const rc = sdiOutcomeFromNotifications("u", { data: [{ type: "RC", created_at: "2026-12-01T10:00:00Z" }] });
    expect(rc?.undelivered).toBeUndefined();
  });

  it("secondo avviso al giorno 4, una volta sola", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = {
      invoice: {
        findMany: vi.fn(async () => [{ id: "a", series: "COM", year: 2026, number: 7, sdiMessage: "00305: P.IVA", sdiRejectedAt: new Date("2026-12-01T10:00:00Z") }]),
        updateMany,
      },
    };
    const service = new InvoicesService(prisma as never, { notify: vi.fn() } as never);
    const notify = vi.spyOn(service, "notifyFinanceAdmins").mockResolvedValue(undefined as never);
    expect(await service.remindRejectedSdi(new Date("2026-12-04T07:15:00Z"))).toBe(1);
    expect(prisma.invoice.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ sdiRejectRemindedAt: null }) }));
    const alerts = (notify.mock.calls[0]![1] as { alerts: string[] }).alerts;
    expect(alerts[0]).toContain("va rimandata entro il 06/12/2026");
    expect(updateMany).toHaveBeenCalledWith({ where: { id: { in: ["a"] } }, data: { sdiRejectRemindedAt: new Date("2026-12-04T07:15:00Z") } });
  });
});

describe("Quadratura del mese", () => {
  const row = (number: number, sdiStatus: string, undelivered = false) => ({ series: "COM", year: 2026, number, sdiStatus, sdiUndeliveredAt: undelivered ? new Date() : null });

  it("conta emesse, arrivate, nel cassetto e da sistemare", () => {
    expect(monthSdiChain([row(1, "DELIVERED"), row(2, "DELIVERED", true), row(3, "REJECTED"), row(4, "SENT")])).toEqual({
      issued: 4,
      delivered: 2,
      undelivered: 1,
      open: ["COM/2026/0003", "COM/2026/0004"],
    });
  });

  it("il 16 avvisa solo se i conti non tornano", async () => {
    const rows = [row(1, "DELIVERED"), row(2, "REJECTED")];
    const prisma = { invoice: { findMany: vi.fn(async () => rows) } };
    const service = new InvoicesService(prisma as never, { notify: vi.fn() } as never);
    Object.assign(service, { sdi: {} });
    const notify = vi.spyOn(service, "notifyFinanceAdmins").mockResolvedValue(undefined as never);
    await service.checkMonthSdiChain(new Date("2026-12-16T08:00:00Z"));
    expect((notify.mock.calls[0]![1] as { month: string; alerts: string[] }).alerts[0]).toContain("2 emesse, 1 arrivate al fisco, 1 ancora da sistemare (COM/2026/0002)");
    rows.pop();
    notify.mockClear();
    await service.checkMonthSdiChain(new Date("2026-12-16T08:00:00Z"));
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("PDF della fattura non consegnata", () => {
  it("dice che l'originale è nel cassetto fiscale", () => {
    const party = { name: "X", lines: [] };
    const model = invoicePdfModel({
      id: "i", number: "COM/2026/0001", source: "JOB_FEES", creditNote: false, periodMonth: "2026-10", issuedAt: "2026-10-31T12:00:00Z", totalEurCents: 4270, sdiStatus: "DELIVERED", sdiUndelivered: true,
      issuer: party, recipient: party, lines: [], taxableEurCents: 3500, vatEurCents: 770, roundingEurCents: 0, vatRatePercent: 22, relatedNumber: null, vatRecoverable: null, onlinePaidEurCents: null,
    } as never);
    expect(JSON.stringify(model)).toContain("cassetto fiscale");
  });
});
