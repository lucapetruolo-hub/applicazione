import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, ForbiddenException, HttpException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { AuthService, emailCodeValidFor, emailLinkValidFor } from "./auth.service";
import { VerifiedEmailGuard } from "./verified-email.guard";

/**
 * Conferma email in registrazione (docs/CHANGELOG.md §178): il link vale una
 * volta sola e scade, e con `EMAIL_VERIFICATION_REQUIRED=true` le azioni
 * principali restano bloccate finché l'email non è confermata.
 */
function buildService() {
  const prisma = {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  const emailService = { send: vi.fn().mockResolvedValue(true) };
  const jwt = { sign: vi.fn().mockReturnValue("jwt-token") };
  const service = new AuthService(prisma as never, jwt as never, {} as never, emailService as never, {} as never);
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

    await service.register("mario@example.it", "password123", "Mario", "PROFESSIONAL");

    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: "mario@example.it" }));
    const token = tokenFromEmail(emailService);
    const stored = prisma.user.update.mock.calls[0]![0].data;
    expect(stored.emailTokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(stored.emailTokenHash).not.toContain(token);
  });

  it("non chiede nessuna conferma al cliente: solo il benvenuto", async () => {
    const { service, prisma, emailService } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "u-1" });

    await service.register("anna@example.it", "password123", "Anna", "CLIENT");

    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: "anna@example.it", subject: expect.stringContaining("Benvenuto") }));
    expect(emailService.send.mock.calls[0]![0].html).not.toContain("conferma-email");
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("il pulsante conferma l'email una volta sola e annulla il codice di riserva", async () => {
    const { service, prisma } = buildService();
    const tokenHash = createHash("sha256").update("a".repeat(43)).digest("hex");
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "mario@example.it", deletedAt: null, emailVerifiedAt: null, emailTokenExpiresAt: new Date(Date.now() + 60_000) });

    await expect(service.verifyEmail("a".repeat(43))).resolves.toEqual({ email: "mario@example.it", alreadyVerified: false });
    // Condizionato: due tocchi insieme confermano una volta sola.
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "u-1", emailTokenHash: tokenHash, emailVerifiedAt: null },
      data: expect.objectContaining({ emailVerifiedAt: expect.any(Date), emailCodeHash: null }),
    });
    // Il link resta salvato: riaperto dice "già confermata" invece di "non valido".
    expect(prisma.user.updateMany.mock.calls[0]![0].data).not.toHaveProperty("emailTokenHash");
  });

  it("riaperto dopo la conferma (anche dall'antivirus della posta) dice già confermata e non cambia nulla", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "mario@example.it", deletedAt: null, emailVerifiedAt: new Date(), emailTokenExpiresAt: new Date(Date.now() - 1) });

    await expect(service.verifyEmail("a".repeat(43))).resolves.toEqual({ email: "mario@example.it", alreadyVerified: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("rifiuta un link scaduto o sconosciuto, con due messaggi diversi", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "mario@example.it", deletedAt: null, emailVerifiedAt: null, emailTokenExpiresAt: new Date(Date.now() - 1) });
    await expect(service.verifyEmail("a".repeat(43))).rejects.toThrow("Il link è scaduto");

    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.verifyEmail("a".repeat(43))).rejects.toThrow("non vale più");

    prisma.user.findUnique.mockResolvedValue({ id: "u-1", email: "deleted-u-1@deleted.invalid", deletedAt: new Date(), emailVerifiedAt: null, emailTokenExpiresAt: new Date(Date.now() + 60_000) });
    await expect(service.verifyEmail("a".repeat(43))).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("cambiando l'email il link mandato al vecchio indirizzo smette di valere", async () => {
    const { service, prisma } = buildService();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.update.mockResolvedValue({ id: "u-1", email: "nuova@example.it", name: "Mario", role: "PROFESSIONAL" });

    await service.updateAccount("u-1", { email: "nuova@example.it" } as never);
    expect(prisma.user.update.mock.calls[0]![0].data).toEqual(
      expect.objectContaining({ email: "nuova@example.it", emailVerifiedAt: null, emailTokenHash: null, emailTokenExpiresAt: null }),
    );
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

  describe("codice di 6 cifre (§243)", () => {
    function codeFromEmail(emailService: { send: ReturnType<typeof vi.fn> }): string {
      const text: string = emailService.send.mock.calls[0]![0].text;
      return /codice sul sito: (\d{6})/.exec(text)![1]!;
    }

    async function registered() {
      const ctx = buildService();
      ctx.prisma.user.findUnique.mockResolvedValue(null);
      ctx.prisma.user.create.mockResolvedValue({ id: "u-1" });
      await ctx.service.register("mario@example.it", "password123", "Mario", "PROFESSIONAL", ["idraulico"], "SOLE_PROPRIETOR");
      const code = codeFromEmail(ctx.emailService);
      const stored = ctx.prisma.user.update.mock.calls[0]![0].data;
      ctx.prisma.user.update.mockClear();
      (ctx.prisma.user as Record<string, unknown>).updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const account = { id: "u-1", email: "mario@example.it", deletedAt: null, emailVerifiedAt: null, emailCodeAttempts: 0, ...stored };
      ctx.prisma.user.findUnique.mockResolvedValue(account);
      return { ...ctx, code, stored, account };
    }

    it("arriva di riserva sotto il pulsante, non nell'oggetto; si salva solo l'impronta", async () => {
      const { emailService, code, stored } = await registered();
      const sent = emailService.send.mock.calls[0]![0];
      // Il pulsante è la cosa da fare: l'oggetto non porta più il codice.
      expect(sent.subject).not.toContain(code);
      expect(sent.subject).toContain("Conferma la tua email");
      expect(sent.html).toContain("conferma-email?token=");
      expect(sent.html.indexOf("Conferma la mia email")).toBeLessThan(sent.html.indexOf(code));
      expect(stored.emailCodeHash).toBe(createHash("sha256").update(`u-1:${code}`).digest("hex"));
      expect(stored.emailCodeExpiresAt.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
      expect(stored.emailCodeExpiresAt.getTime() - Date.now()).toBeLessThanOrEqual(15 * 60_000);
      expect(stored.emailCodeAttempts).toBe(0);
    });

    it("il tipo scelto in registrazione resta sull'account", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: "u-1" });
      await service.register("mario@example.it", "password123", undefined, "PROFESSIONAL", ["idraulico"], "BUSINESS");
      expect(prisma.user.create.mock.calls[0]![0].data.signupEntityType).toBe("BUSINESS");
    });

    it("il codice giusto conferma l'email e lo annulla", async () => {
      const { service, prisma, code } = await registered();
      await expect(service.verifyEmailCode("u-1", code)).resolves.toEqual({ email: "mario@example.it" });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: expect.objectContaining({ emailVerifiedAt: expect.any(Date), emailCodeHash: null }),
      });
    });

    it("un codice sbagliato dice quanti tentativi restano e non conferma", async () => {
      const { service, prisma, code } = await registered();
      const wrong = code === "000000" ? "111111" : "000000";
      await expect(service.verifyEmailCode("u-1", wrong)).rejects.toThrow("ti restano 4 tentativi");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("dopo 5 tentativi serve un codice nuovo, anche quello giusto non basta", async () => {
      const { service, prisma, code } = await registered();
      (prisma.user as unknown as { updateMany: ReturnType<typeof vi.fn> }).updateMany.mockResolvedValue({ count: 0 });
      await expect(service.verifyEmailCode("u-1", code)).rejects.toThrow("troppe volte");
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("un codice scaduto non vale", async () => {
      const { service, prisma, code, account } = await registered();
      prisma.user.findUnique.mockResolvedValue({ ...account, emailCodeExpiresAt: new Date(Date.now() - 1) });
      await expect(service.verifyEmailCode("u-1", code)).rejects.toThrow("scaduto");
    });

    it("un nuovo codice si chiede solo dopo 60 secondi", async () => {
      const { service, prisma, emailService, account } = await registered();
      emailService.send.mockClear();
      await expect(service.resendVerificationEmail("u-1")).rejects.toBeInstanceOf(HttpException);
      expect(emailService.send).not.toHaveBeenCalled();

      prisma.user.findUnique.mockResolvedValue({ ...account, emailCodeSentAt: new Date(Date.now() - 61_000) });
      await expect(service.resendVerificationEmail("u-1")).resolves.toEqual({ alreadyVerified: false });
      expect(emailService.send).toHaveBeenCalledTimes(1);
    });
  });
});

describe("validità del codice per /auth/me (§244)", () => {
  const now = new Date("2026-10-15T10:00:00Z");
  const base = { emailCodeHash: "h", emailCodeExpiresAt: new Date(now.getTime() + 90_000), emailCodeAttempts: 0 };

  it("restituisce i secondi che restano a un codice valido", () => {
    expect(emailCodeValidFor(base, now)).toBe(90);
  });

  it("vale 0 per un codice scaduto, mai mandato o con i tentativi finiti", () => {
    expect(emailCodeValidFor({ ...base, emailCodeExpiresAt: new Date(now.getTime() - 1000) }, now)).toBe(0);
    expect(emailCodeValidFor({ ...base, emailCodeHash: null }, now)).toBe(0);
    expect(emailCodeValidFor({ ...base, emailCodeAttempts: 5 }, now)).toBe(0);
  });
});

describe("validità del pulsante per /auth/me", () => {
  const now = new Date("2026-10-28T10:00:00Z");
  it("restituisce i secondi che restano, 0 se scaduto o mai mandato", () => {
    expect(emailLinkValidFor(new Date(now.getTime() + 90_000), now)).toBe(90);
    expect(emailLinkValidFor(new Date(now.getTime() - 1000), now)).toBe(0);
    expect(emailLinkValidFor(null, now)).toBe(0);
  });
});
