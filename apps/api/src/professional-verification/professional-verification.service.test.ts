import { describe, expect, it, vi } from "vitest";
import { ProfessionalVerificationService } from "./professional-verification.service";

/**
 * Badge "Verificato" (docs/CHANGELOG.md §253, §338): lo dà solo la verifica di
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
      data: { verified: false, verifiedAt: null, verifiedByUserId: null, verificationNote: "Partita IVA cessata", identityExpiredAt: null },
    });
    expect(notificationsService.notify).toHaveBeenCalledWith("u-1", "PROFILE_VERIFICATION_REMOVED", { note: "Partita IVA cessata" });
  });

  it("documento scaduto: badge tolto, ma si continuano a inviare preventivi (§338)", async () => {
    const { service, prisma, notificationsService } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue({ ...activeProfile, verified: true });
    await service.revokeOverTime("p-1", "Documento scaduto", true);
    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({
      where: { id: "p-1" },
      data: expect.objectContaining({ verified: false, verificationNote: "Documento scaduto", identityExpiredAt: expect.any(Date) }),
    });
    expect(notificationsService.notify).toHaveBeenCalledWith("u-1", "PROFILE_VERIFICATION_REMOVED", { note: "Documento scaduto" });
  });

  it("badge di prova tolto: la verifica va rifatta prima dei preventivi (§338)", async () => {
    const { service, prisma } = buildService();
    prisma.professionalProfile.findUnique.mockResolvedValue({ ...activeProfile, verified: true });
    await service.revokeOverTime("p-1", "Prova", false);
    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({ where: { id: "p-1" }, data: expect.objectContaining({ verified: false, identityExpiredAt: null }) });
  });
});

describe("Cambia tipo dall'admin (migliorie del collaudo, gruppo 8)", () => {
  function withFiscal(fiscal: { id: string; entityType: string | null; stripeConnectAccountId: string | null } | null, verified = false) {
    const built = buildService();
    const prisma = built.prisma as typeof built.prisma & Record<string, unknown>;
    built.prisma.professionalProfile.findUnique.mockResolvedValue({ ...activeProfile, verified });
    Object.assign(prisma, {
      user: { findUnique: vi.fn().mockResolvedValue({ signupEntityType: "PRIVATE_INDIVIDUAL" }), update: vi.fn().mockReturnValue("user-update") },
      professionalFiscalProfile: { findUnique: vi.fn().mockResolvedValue(fiscal), update: vi.fn().mockReturnValue("fiscal-update") },
      $transaction: vi.fn().mockResolvedValue([]),
    });
    return built;
  }

  it("da privato ad azienda: tipo nuovo, dichiarazione da riconfermare, avviso col motivo", async () => {
    const { service, prisma, auditLogService, notificationsService } = withFiscal({ id: "f-1", entityType: "PRIVATE_INDIVIDUAL", stripeConnectAccountId: null });
    await service.changeEntityType("admin-1", "p-1", "BUSINESS", "È una S.R.L.");
    const p = prisma as unknown as { professionalFiscalProfile: { update: ReturnType<typeof vi.fn> }; user: { update: ReturnType<typeof vi.fn> } };
    expect(p.professionalFiscalProfile.update).toHaveBeenCalledWith({ where: { id: "f-1" }, data: { entityType: "BUSINESS", fiscalDeclarationAcceptedAt: null } });
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: "u-1" }, data: { signupEntityType: "BUSINESS" } });
    expect(auditLogService.record).toHaveBeenCalledWith(expect.objectContaining({ fieldName: "entityType", oldValue: "PRIVATE_INDIVIDUAL", newValue: "BUSINESS", reason: "È una S.R.L." }));
    expect(notificationsService.notify).toHaveBeenCalledWith("u-1", "FISCAL_ENTITY_TYPE_CHANGED", expect.objectContaining({ entityType: "BUSINESS", note: "È una S.R.L." }));
  });

  it("con il badge Verificato lo toglie: cambia la persona da verificare", async () => {
    const { service, prisma } = withFiscal({ id: "f-1", entityType: "PRIVATE_INDIVIDUAL", stripeConnectAccountId: null }, true);
    await service.changeEntityType("admin-1", "p-1", "BUSINESS", "È una S.R.L.");
    expect(prisma.professionalProfile.update).toHaveBeenCalledWith({ where: { id: "p-1" }, data: expect.objectContaining({ verified: false }) });
  });

  it("stesso tipo o Stripe già collegato: non cambia nulla", async () => {
    const same = withFiscal({ id: "f-1", entityType: "BUSINESS", stripeConnectAccountId: null });
    await expect(same.service.changeEntityType("admin-1", "p-1", "BUSINESS", "motivo")).rejects.toThrow("È già");
    const stripe = withFiscal({ id: "f-1", entityType: "PRIVATE_INDIVIDUAL", stripeConnectAccountId: "acct_1" });
    await expect(stripe.service.changeEntityType("admin-1", "p-1", "BUSINESS", "motivo")).rejects.toThrow("Stripe");
  });

  it("senza dati fiscali cambia il tipo scelto all'iscrizione", async () => {
    const { service, prisma } = withFiscal(null);
    await service.changeEntityType("admin-1", "p-1", "SOLE_PROPRIETOR", "Ha la partita IVA");
    const p = prisma as unknown as { professionalFiscalProfile: { update: ReturnType<typeof vi.fn> }; user: { update: ReturnType<typeof vi.fn> } };
    expect(p.user.update).toHaveBeenCalledWith({ where: { id: "u-1" }, data: { signupEntityType: "SOLE_PROPRIETOR" } });
    expect(p.professionalFiscalProfile.update).not.toHaveBeenCalled();
  });
});
