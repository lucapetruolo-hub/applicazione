import { describe, expect, it, vi } from "vitest";
import { ProfessionalVerificationService } from "./professional-verification.service";

/**
 * Badge "Verificato" (docs/CHANGELOG.md §253, §335): lo dà solo la verifica di
 * documento e selfie, l'admin può solo toglierlo; ogni cambio finisce nel
 * registro azioni e arriva al professionista.
 */
function buildService() {
  const prisma = {
    professionalProfile: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}), count: vi.fn() },
    identityVerification: { updateMany: vi.fn() },
  };
  const auditLogService = { record: vi.fn() };
  const notificationsService = { notify: vi.fn() };
  const service = new ProfessionalVerificationService(prisma as never, auditLogService as never, notificationsService as never);
  return { service, prisma, auditLogService, notificationsService };
}

const activeProfile = { id: "p-1", userId: "u-1", verified: false, deletedAt: null, invitePendingAt: null };

describe("ProfessionalVerificationService", () => {
  it("documento e selfie approvati dal fornitore: badge senza admin (§253)", async () => {
    const { service, prisma, notificationsService } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue(activeProfile);
    await service.markVerifiedByProvider("p-1", "didit");
    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({ where: { id: "p-1" }, data: expect.objectContaining({ verified: true, verifiedByUserId: null }) });
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
});
