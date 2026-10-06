import { describe, expect, it, vi } from "vitest";
import { ConflictException, GoneException, NotFoundException } from "@nestjs/common";
import { ProfileInvitesService } from "./profile-invites.service";

/**
 * Profili creati al telefono (docs/CHANGELOG.md §170): il link d'invito è
 * l'unica chiave dell'account finché il professionista non sceglie la
 * password, quindi deve valere una volta sola e scadere.
 */
function buildService() {
  const prisma = {
    user: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn().mockResolvedValue({}) },
    profileInvite: { create: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }), findUnique: vi.fn() },
  };
  const professionalsService = { upsertMyProfile: vi.fn() };
  const auditLogService = { record: vi.fn() };
  const emailService = { send: vi.fn().mockResolvedValue(true) };
  const jwt = { sign: vi.fn().mockReturnValue("jwt-token") };
  const service = new ProfileInvitesService(prisma as never, professionalsService as never, auditLogService as never, emailService as never, jwt as never);
  return { service, prisma, professionalsService, emailService };
}

const input = { email: "Mario@Example.it", name: "Mario", businessName: "Idraulica Rossi", categorySlug: "idraulico" as const, city: "Latina" };

function validInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: "inv-1",
    userId: "u-1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { deletedAt: null, passwordHash: null, email: "mario@example.it", name: "Mario", professionalProfile: { businessName: "Idraulica Rossi" } },
    ...overrides,
  };
}

describe("ProfileInvitesService", () => {
  it("crea account e profilo senza dichiarazione, e manda il link", async () => {
    const { service, prisma, professionalsService, emailService } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "u-1" });
    prisma.user.findUniqueOrThrow.mockResolvedValue({ id: "u-1", email: "mario@example.it", name: "Mario", professionalProfile: { businessName: "Idraulica Rossi" } });

    const link = await service.createByOperator("admin-1", input);

    expect(prisma.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ email: "mario@example.it", role: "PROFESSIONAL" }) });
    expect(professionalsService.upsertMyProfile).toHaveBeenCalledWith("u-1", expect.objectContaining({ businessName: "Idraulica Rossi" }), { byOperator: true });
    expect(link.inviteUrl).toMatch(/\/completa-profilo\?codice=[\w-]{40,}$/);
    expect(link.emailSent).toBe(true);
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: "mario@example.it" }));
    // Si salva solo l'impronta del codice, mai il codice.
    const token = link.inviteUrl.split("codice=")[1]!;
    expect(prisma.profileInvite.create.mock.calls[0]![0].data.tokenHash).not.toContain(token);
  });

  it("rifiuta un'email già registrata", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: "esiste" });

    await expect(service.createByOperator("admin-1", input)).rejects.toThrow(ConflictException);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("se il profilo non si salva, non lascia un account a metà", async () => {
    const { service, prisma, professionalsService } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "u-1" });
    professionalsService.upsertMyProfile.mockRejectedValue(new NotFoundException("Categoria non valida."));

    await expect(service.createByOperator("admin-1", input)).rejects.toThrow(NotFoundException);
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: "u-1" } });
  });

  it("con il link valido imposta la password ed entra", async () => {
    const { service, prisma } = buildService();
    prisma.profileInvite.findUnique.mockResolvedValue(validInvite());

    const result = await service.accept({ token: "x".repeat(43), password: "password-sicura", acceptedLegalTerms: true, declaredAdult: true });

    expect(result).toEqual({ token: "jwt-token", isNewUser: true });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u-1" }, data: expect.objectContaining({ passwordHash: expect.any(String) }) });
  });

  it("un link scaduto o già usato non vale", async () => {
    const { service, prisma } = buildService();
    prisma.profileInvite.findUnique.mockResolvedValueOnce(validInvite({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(service.preview("x".repeat(43))).rejects.toThrow(GoneException);

    prisma.profileInvite.findUnique.mockResolvedValueOnce(validInvite({ usedAt: new Date() }));
    await expect(service.preview("x".repeat(43))).rejects.toThrow(GoneException);

    prisma.profileInvite.findUnique.mockResolvedValueOnce(null);
    await expect(service.preview("x".repeat(43))).rejects.toThrow(NotFoundException);
  });

  it("due conferme contemporanee: solo la prima imposta la password", async () => {
    const { service, prisma } = buildService();
    prisma.profileInvite.findUnique.mockResolvedValue(validInvite());
    prisma.profileInvite.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.accept({ token: "x".repeat(43), password: "password-sicura", acceptedLegalTerms: true, declaredAdult: true })).rejects.toThrow();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
