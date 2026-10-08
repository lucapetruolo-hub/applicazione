import { describe, expect, it, vi } from "vitest";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { verifyProfessionalSchema } from "@professionisti/shared";
import { ProfessionalVerificationService } from "./professional-verification.service";

/**
 * Verifica manuale dei professionisti (docs/CHANGELOG.md §199): il badge
 * "Verificato" lo assegna solo un admin, con i due controlli spuntati, e ogni
 * cambio finisce nel registro azioni e arriva al professionista.
 */
function buildService() {
  const prisma = {
    professionalProfile: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
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
