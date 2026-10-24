import { describe, expect, it, vi } from "vitest";
import { createContentReportSchema } from "@professionisti/shared";
import { ContentReportsService } from "./content-reports.service";

/** Segnalazioni secondo il DSA art. 16 (docs/CHANGELOG.md §318). */
function buildService() {
  const prisma = {
    lead: { findFirst: vi.fn().mockResolvedValue({ id: "lead-1" }) },
    contentReport: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "rep-1" }),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
  const notifications = { notify: vi.fn(), emailAdminsNewReport: vi.fn() };
  const service = new ContentReportsService(prisma as never, notifications as never);
  return { service, prisma, notifications };
}

describe("segnalazione di un contenuto", () => {
  it("un contenuto illegale richiede spiegazione e buona fede", () => {
    const base = { targetType: "REVIEW", targetId: "r-1", reason: "insulti-minacce" };
    expect(createContentReportSchema.safeParse(base).success).toBe(false);
    expect(createContentReportSchema.safeParse({ ...base, details: "Mi dà del ladro" }).success).toBe(false);
    expect(createContentReportSchema.safeParse({ ...base, details: "Mi dà del ladro", goodFaith: true }).success).toBe(true);
  });

  it("una violazione dei Termini non richiede altro", () => {
    expect(createContentReportSchema.safeParse({ targetType: "REVIEW", targetId: "r-1", reason: "spam" }).success).toBe(true);
    expect(createContentReportSchema.safeParse({ targetType: "REVIEW", targetId: "r-1", reason: "motivo-inventato" }).success).toBe(false);
  });

  it("salva se è illegale e la buona fede, e conferma subito la presa in carico", async () => {
    const { service, prisma, notifications } = buildService();
    await service.create("user-1", { targetType: "REVIEW", targetId: "r-1", reason: "insulti-minacce", details: "Mi dà del ladro", goodFaith: true });
    expect(prisma.contentReport.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ reason: "Insulti, minacce o diffamazione", claimsIllegal: true, goodFaithAt: expect.any(Date) }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith("user-1", "CONTENT_REPORT_RECEIVED", { contentReportId: "rep-1", targetType: "REVIEW" });
  });

  it("una segnalazione di spam non è illegale", async () => {
    const { service, prisma } = buildService();
    await service.create("user-1", { targetType: "REVIEW", targetId: "r-1", reason: "spam" });
    expect(prisma.contentReport.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ claimsIllegal: false, goodFaithAt: null }) }));
  });

  it("la pagina delle decisioni mostra solo quelle sui propri contenuti, mai chi ha segnalato", async () => {
    const { service, prisma } = buildService();
    prisma.contentReport.findMany.mockResolvedValue([
      { id: "rep-1", targetType: "REVIEW", action: "HIDE_CONTENT", ground: "legge-diffamazione", reporterId: "segreto", reason: "Insulti", resolvedAt: new Date(), resolutionNote: "x" },
    ]);
    const result = await service.listMine("author-1");
    expect(prisma.contentReport.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { contentOwnerId: "author-1", status: "RESOLVED" } }));
    expect(result).not.toHaveProperty("submitted");
    expect(JSON.stringify(result)).not.toContain("segreto");
    expect(result.received[0]).toMatchObject({ id: "rep-1", ground: "legge-diffamazione" });
  });
});
