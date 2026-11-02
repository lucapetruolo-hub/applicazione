import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import { Dac7Service } from "./dac7.service";

/** Promemoria di gennaio sulla comunicazione DAC7 (docs/changelog/2026-11-02-admin-protezioni.md). */
function build(period: { id: string; status: string } | null, reportable: number) {
  const prisma = {
    dac7ReportingPeriod: { findFirst: vi.fn().mockResolvedValue(period) },
    dac7Record: { count: vi.fn().mockResolvedValue(reportable) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: "fin", adminRoles: ["FINANCE"] }, { id: "mod", adminRoles: ["MODERATOR"] }]) },
  };
  const notifications = { notify: vi.fn().mockResolvedValue(undefined) };
  const service = new Dac7Service(prisma as unknown as PrismaClient, notifications as never);
  return { service, prisma, notifications };
}

describe("promemoria DAC7 di gennaio", () => {
  it("avvisa la Finanza con i giorni che mancano se l'anno prima non è inviato", async () => {
    const { service, prisma, notifications } = build({ id: "p", status: "EXPORTED" }, 3);
    expect(await service.remindAnnualDeadline(new Date("2027-01-20T08:00:00Z"))).toBe(true);
    expect(prisma.dac7ReportingPeriod.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { year: 2026, quarter: null } }));
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    expect(notifications.notify).toHaveBeenCalledWith("fin", "ADMIN_DAC7_DUE", { year: 2026, daysLeft: 11 });
  });

  it("non avvisa se è già inviato o se nessuno ha compensi", async () => {
    expect(await build({ id: "p", status: "SUBMITTED" }, 3).service.remindAnnualDeadline(new Date("2027-01-20T08:00:00Z"))).toBe(false);
    expect(await build({ id: "p", status: "READY" }, 0).service.remindAnnualDeadline(new Date("2027-01-20T08:00:00Z"))).toBe(false);
    expect(await build(null, 0).service.remindAnnualDeadline(new Date("2027-01-20T08:00:00Z"))).toBe(false);
  });
});
