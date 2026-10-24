import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { createHash } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { AuthService } from "./auth.service";

/** Recupero password (docs/CHANGELOG.md §185). */
function buildService() {
  const prisma = { user: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
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
    // Gli accessi sugli altri dispositivi si chiudono (§292).
    expect(data.sessionVersion).toEqual({ increment: 1 });
    expect(data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await bcrypt.compare("nuovaPassword1", data.passwordHash)).toBe(true);
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ subject: "La tua password è stata cambiata" }));
  });

  it("rifiuta una password nuova che contiene l'email (§289)", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "mario.rossi@example.it", deletedAt: null, passwordResetExpiresAt: new Date(Date.now() + 60_000) });
    await expect(service.confirmPasswordReset("x".repeat(43), "Mario.Rossi2026")).rejects.toThrow("La password non può contenere la tua email.");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("rifiuta un link scaduto", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "mario@example.it", deletedAt: null, passwordResetExpiresAt: new Date(Date.now() - 1) });
    await expect(service.confirmPasswordReset("x".repeat(43), "nuovaPassword1")).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe("recupero password con il codice di 6 cifre (§245)", () => {
  const codeHash = (code: string) => createHash("sha256").update(`u-1:${code}`).digest("hex");

  it("mette il codice nell'oggetto e nel testo, e ne salva solo l'impronta", async () => {
    const { service, prisma, emailService } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "mario@example.it", name: "Mario", deletedAt: null });

    await service.requestPasswordReset("mario@example.it");

    const sent = emailService.send.mock.calls[0]![0];
    const code = /^(\d{6}) è il codice per reimpostare la password$/.exec(sent.subject)![1]!;
    expect(sent.text).toContain(code);
    const stored = prisma.user.update.mock.calls[0]![0].data;
    expect(stored.passwordResetCodeHash).toBe(codeHash(code));
    expect(stored.passwordResetCodeAttempts).toBe(0);
    expect(stored.passwordResetCodeExpiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60 * 1000);
  });

  const withCode = (extra: Record<string, unknown> = {}) => ({
    id: "u-1",
    email: "mario@example.it",
    deletedAt: null,
    passwordResetCodeHash: codeHash("123456"),
    passwordResetCodeExpiresAt: new Date(Date.now() + 60_000),
    passwordResetCodeAttempts: 0,
    ...extra,
  });

  it("con il codice giusto restituisce un link nuovo e annulla il codice", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(withCode());

    const { token } = await service.exchangePasswordResetCode("mario@example.it", "123456");

    const data = prisma.user.update.mock.calls[0]![0].data;
    expect(data.passwordResetTokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(data.passwordResetCodeHash).toBeNull();
  });

  it("stesso errore per codice sbagliato, scaduto, tentativi finiti o account inesistente", async () => {
    const message = "Codice non corretto o scaduto. Controlla l'ultima email ricevuta oppure chiedine uno nuovo.";
    const cases: [unknown, number][] = [
      [withCode(), 1],
      [withCode({ passwordResetCodeExpiresAt: new Date(Date.now() - 1) }), 1],
      [withCode(), 0],
      [null, 1],
    ];
    for (const [user, count] of cases) {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.updateMany.mockResolvedValue({ count });
      const code = user && count === 1 && (user as { passwordResetCodeExpiresAt: Date }).passwordResetCodeExpiresAt > new Date() ? "654321" : "123456";
      await expect(service.exchangePasswordResetCode("mario@example.it", code)).rejects.toThrow(message);
      expect(prisma.user.update).not.toHaveBeenCalled();
    }
  });
});
