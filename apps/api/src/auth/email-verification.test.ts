import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { AuthService } from "./auth.service";
import { VerifiedEmailGuard } from "./verified-email.guard";

/**
 * Conferma email in registrazione (docs/CHANGELOG.md §174): il link vale una
 * volta sola e scade, e con `EMAIL_VERIFICATION_REQUIRED=true` le azioni
 * principali restano bloccate finché l'email non è confermata.
 */
function buildService() {
  const prisma = {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn().mockResolvedValue({}) },
  };
  const emailService = { send: vi.fn().mockResolvedValue(true) };
  const jwt = { sign: vi.fn().mockReturnValue("jwt-token") };
  const service = new AuthService(prisma as never, jwt as never, {} as never, emailService as never);
  return { service, prisma, emailService };
}

function tokenFromEmail(emailService: { send: ReturnType<typeof vi.fn> }): string {
  const html: string = emailService.send.mock.calls[0]![0].html;
  const match = /conferma-email\?token=([^"]+)"/.exec(html);
  return decodeURIComponent(match![1]!);
}

describe("conferma email", () => {
  afterEach(() => {
    delete process.env.EMAIL_VERIFICATION_REQUIRED;
  });

  it("alla registrazione salva solo l'impronta del codice e manda il link", async () => {
    const { service, prisma, emailService } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "u-1" });

    await service.register("mario@example.it", "password123", "Mario", "CLIENT");

    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: "mario@example.it" }));
    const token = tokenFromEmail(emailService);
    const stored = prisma.user.update.mock.calls[0]![0].data;
    expect(stored.emailTokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(stored.emailTokenHash).not.toContain(token);
  });

  it("conferma l'email e annulla il codice", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "mario@example.it", deletedAt: null, emailTokenExpiresAt: new Date(Date.now() + 60_000) });

    await expect(service.verifyEmail("a".repeat(43))).resolves.toEqual({ email: "mario@example.it" });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-1" },
      data: { emailVerifiedAt: expect.any(Date), emailTokenHash: null, emailTokenExpiresAt: null },
    });
  });

  it("rifiuta un link scaduto o sconosciuto", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "mario@example.it", deletedAt: null, emailTokenExpiresAt: new Date(Date.now() - 1) });
    await expect(service.verifyEmail("a".repeat(43))).rejects.toBeInstanceOf(BadRequestException);

    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.verifyEmail("a".repeat(43))).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("non rispedisce il link a chi ha già confermato", async () => {
    const { service, prisma, emailService } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "mario@example.it", deletedAt: null, emailVerifiedAt: new Date() });

    await expect(service.resendVerificationEmail("u-1")).resolves.toEqual({ alreadyVerified: true });
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it("blocca le azioni principali solo quando la conferma è richiesta", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ emailVerifiedAt: null }) } };
    const guard = new VerifiedEmailGuard(prisma as never);
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: { userId: "u-1" } }) }) } as never;

    await expect(guard.canActivate(context)).resolves.toBe(true);

    process.env.EMAIL_VERIFICATION_REQUIRED = "true";
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);

    prisma.user.findUnique.mockResolvedValue({ emailVerifiedAt: new Date() });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
