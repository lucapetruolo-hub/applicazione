import { describe, expect, it, vi } from "vitest";
import type { TermsChange } from "@professionisti/shared";
import { TermsNoticeService } from "./terms-notice.service";

/** Avviso del cambio dei Termini (docs/changelog/2026-10-30-termini-privacy-obblighi.md). */
describe("TermsNoticeService", () => {
  const changes: TermsChange[] = [{ version: "2027-01-10", publishedAt: "2027-01-10", effectiveAt: "2027-01-25", summary: ["Nuova commissione"], notify: true }];

  function setup(notice: { finishedAt: Date | null; lastUserId: string | null }, userIds: string[]) {
    const prisma = {
      termsChangeNotice: { upsert: vi.fn().mockResolvedValue({ version: "2027-01-10", ...notice }), update: vi.fn() },
      user: { findMany: vi.fn().mockResolvedValue(userIds.map((id) => ({ id }))) },
    };
    const notifications = { notify: vi.fn() };
    const service = new TermsNoticeService(prisma as never, notifications as never);
    service.pauseMs = 0;
    return { prisma, notifications, service };
  }

  it("prima della pubblicazione non manda nulla", async () => {
    const { notifications, service } = setup({ finishedAt: null, lastUserId: null }, ["a"]);
    expect(await service.run(new Date("2027-01-09T10:00:00Z"), changes)).toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it("avvisa gli account dopo l'ultimo e chiude quando sono finiti", async () => {
    const { prisma, notifications, service } = setup({ finishedAt: null, lastUserId: "a" }, ["b", "c"]);
    expect(await service.run(new Date("2027-01-10T10:00:00Z"), changes)).toBe(2);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { deletedAt: null, id: { gt: "a" } } }));
    expect(notifications.notify).toHaveBeenCalledWith("b", "TERMS_CHANGED", { version: "2027-01-10" });
    expect(prisma.termsChangeNotice.update).toHaveBeenCalledWith({
      where: { version: "2027-01-10" },
      data: { sentCount: { increment: 2 }, lastUserId: "c", finishedAt: expect.any(Date) },
    });
  });

  it("una versione già annunciata non riparte", async () => {
    const { notifications, service } = setup({ finishedAt: new Date(), lastUserId: "z" }, ["a"]);
    expect(await service.run(new Date("2027-02-01T10:00:00Z"), changes)).toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it("le versioni di prima del lancio non si annunciano", async () => {
    const { notifications, service } = setup({ finishedAt: null, lastUserId: null }, ["a"]);
    expect(await service.run(new Date("2027-02-01T10:00:00Z"), [{ ...changes[0]!, notify: false }])).toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
