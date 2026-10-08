import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { verifyProfessionalSchema } from "@professionisti/shared";
import { ProfessionalVerificationService } from "./professional-verification.service";

/**
 * Verifica manuale dei professionisti (docs/CHANGELOG.md §200): il badge
 * "Verificato" lo assegna solo un admin, con i due controlli spuntati, e ogni
 * cambio finisce nel registro azioni e arriva al professionista.
 */
function buildService() {
  const prisma = {
    professionalProfile: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}), count: vi.fn() },
  };
  const auditLogService = { record: vi.fn() };
  const notificationsService = { notify: vi.fn() };
  const service = new ProfessionalVerificationService(prisma as never, auditLogService as never, notificationsService as never);
  return { service, prisma, auditLogService, notificationsService };
}

const activeProfile = { id: "p-1", userId: "u-1", verified: false, deletedAt: null, invitePendingAt: null };

describe("ProfessionalVerificationService", () => {
  it("verifica il profilo, registra chi l'ha fatto e avvisa il professionista", async () => {
    const { service, prisma, auditLogService, notificationsService } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(activeProfile);

    await service.verify("admin-1", "p-1", "Videochiamata");

    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: expect.objectContaining({ verified: true, verifiedByUserId: "admin-1", verificationNote: "Videochiamata" }),
    });
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({ entityId: "p-1", newValue: true, changedByUserId: "admin-1" }));
    expect(notificationsService.notify).toHaveBeenCalledWith("u-1", "PROFILE_VERIFIED", {});
  });

  it("toglie la verifica con il motivo, che arriva al professionista", async () => {
    const { service, prisma, notificationsService } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue({ ...activeProfile, verified: true });

    await service.unverify("admin-1", "p-1", "Partita IVA cessata");

    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: { verified: false, verifiedAt: null, verifiedByUserId: null, verificationNote: "Partita IVA cessata" },
    });
    expect(notificationsService.notify).toHaveBeenCalledWith("u-1", "PROFILE_VERIFICATION_REMOVED", { note: "Partita IVA cessata" });
  });

  it("non verifica un profilo eliminato o non ancora confermato", async () => {
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue({ ...activeProfile, deletedAt: new Date() });
    await expect(service.verify("admin-1", "p-1")).rejects.toBeInstanceOf(NotFoundException);

    prisma.professionalProfile.findUnique.mockResolvedValue({ ...activeProfile, invitePendingAt: new Date() });
    await expect(service.verify("admin-1", "p-1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.professionalProfile.update).not.toHaveBeenCalled();
  });

  it("senza i due controlli spuntati la richiesta non passa", () => {
    expect(verifyProfessionalSchema.safeParse({ identityChecked: true, taxIdChecked: false }).success).toBe(false);
    expect(verifyProfessionalSchema.safeParse({ identityChecked: true }).success).toBe(false);
    expect(verifyProfessionalSchema.safeParse({ identityChecked: true, taxIdChecked: true }).success).toBe(true);
  });
});

describe("ProfessionalVerificationService.revokeAfterOwnChange", () => {
  it("toglie il badge se il professionista cambia un dato controllato", async () => {
    const { service, prisma, notificationsService } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue({ id: "p-1", userId: "u-1", verified: true });

    await service.revokeAfterOwnChange("p-1", "u-1", "Partita IVA cambiata");

    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: { verified: false, verifiedAt: null, verifiedByUserId: null, verificationNote: "Partita IVA cambiata" },
    });
    expect(notificationsService.notify).toHaveBeenCalledWith("u-1", "PROFILE_VERIFICATION_REMOVED", { note: "Partita IVA cambiata" });
  });

  it("non fa nulla su un profilo non verificato", async () => {
    const { service, prisma, notificationsService } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue({ id: "p-1", userId: "u-1", verified: false });

    await service.revokeAfterOwnChange("p-1", "u-1", "Partita IVA cambiata");

    expect(prisma.professionalProfile.update).not.toHaveBeenCalled();
    expect(notificationsService.notify).not.toHaveBeenCalled();
  });
});

describe("ProfessionalVerificationService.requestVerification", () => {
  it("segna la richiesta una volta sola", async () => {
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue({ ...activeProfile, verificationRequestedAt: null });
    await service.requestVerification("u-1");
    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({ where: { id: "p-1" }, data: { verificationRequestedAt: expect.any(Date) } });

    prisma.professionalProfile.update.mockClear();
    prisma.professionalProfile.findUnique.mockResolvedValue({ ...activeProfile, verificationRequestedAt: new Date("2026-10-08") });
    const again = await service.requestVerification("u-1");
    expect(again.verificationRequestedAt).toBe("2026-10-08T00:00:00.000Z");
    expect(prisma.professionalProfile.update).not.toHaveBeenCalled();
  });

  it("rifiuta un profilo già verificato", async () => {
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue({ ...activeProfile, verified: true, verificationRequestedAt: null });
    await expect(service.requestVerification("u-1")).rejects.toBeInstanceOf(BadRequestException);
  });
});
