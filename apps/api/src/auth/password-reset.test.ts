import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";

/** Recupero password (docs/CHANGELOG.md §185). */
function buildService() {
  const prisma = { user: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) } };
  const emailService = { send: vi.fn().mockResolvedValue(true) };
  const jwt = { sign: vi.fn().mockReturnValue("jwt-token") };
  const service = new AuthService(prisma as never, jwt as never, {} as never, emailService as never, {} as never);
  return { service, prisma, emailService };
}

describe("recupero password", () => {
  it("manda il link e salva solo l'impronta del codice", async () => {
    const { service, prisma, emailService } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "mario@example.it", name: "Mario", deletedAt: null });

    await service.requestPasswordReset("mario@example.it");

    const html: string = emailService.send.mock.calls[0]![0].html;
    const token = decodeURIComponent(/reimposta-password\?token=([^"]+)"/.exec(html)![1]!);
    const stored = prisma.user.update.mock.calls[0]![0].data;
    expect(stored.passwordResetTokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(stored.passwordResetExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("non manda nulla, e non lo dice, se l'account non esiste", async () => {
    const { service, prisma, emailService } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.requestPasswordReset("nessuno@example.it")).resolves.toBeUndefined();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it("imposta la nuova password, annulla il link ed entra nell'account", async () => {
    const { service, prisma, emailService } = buildService();
    prisma.user.findUnique.mockResolvedValue({
      id: "u-1",
      email: "mario@example.it",
      name: "Mario",
      deletedAt: null,
      suspendedAt: null,
      emailVerifiedAt: null,
      passwordResetExpiresAt: new Date(Date.now() + 60_000),
    });

    const result = await service.confirmPasswordReset("x".repeat(43), "nuovaPassword1");

    expect(result.token).toBe("jwt-token");
    const data = prisma.user.update.mock.calls[0]![0].data;
    expect(data.passwordResetTokenHash).toBeNull();
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await bcrypt.compare("nuovaPassword1", data.passwordHash)).toBe(true);
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ subject: "La tua password è stata cambiata" }));
  });

  it("rifiuta un link scaduto", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "mario@example.it", deletedAt: null, passwordResetExpiresAt: new Date(Date.now() - 1) });
    await expect(service.confirmPasswordReset("x".repeat(43), "nuovaPassword1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
