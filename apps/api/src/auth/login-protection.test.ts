import { describe, expect, it, vi } from "vitest";
import { HttpException, UnauthorizedException } from "@nestjs/common";
import { createHash } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { AuthService, LOGIN_MAX_FAILURES } from "./auth.service";
import { loginDeviceHash, loginDeviceLabel } from "./login-device";

/** Limite per account e avviso di accesso da un dispositivo nuovo (docs/CHANGELOG.md §289). */
const PASSWORD = "giusta2026";
const passwordHash = bcrypt.hashSync(PASSWORD, 4);
const DEVICE = { id: "11111111-2222-4333-8444-555555555555", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36" };

function buildService(user: Record<string, unknown>) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        id: "u-1",
        email: "mario@example.it",
        name: "Mario",
        role: "PROFESSIONAL",
        passwordHash,
        suspendedAt: null,
        failedLoginCount: 0,
        loginLockedUntil: null,
        ...user,
      }),
      update: vi.fn().mockResolvedValue({ failedLoginCount: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    professionalProfile: { findUnique: vi.fn().mockResolvedValue(null) },
    loginDevice: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), count: vi.fn().mockResolvedValue(1), create: vi.fn().mockResolvedValue({}) },
  };
  const emailService = { send: vi.fn().mockResolvedValue(true) };
  const jwt = { sign: vi.fn().mockReturnValue("jwt-token") };
  const service = new AuthService(prisma as never, jwt as never, {} as never, emailService as never, {} as never);
  return { service, prisma, emailService };
}

describe("limite di password sbagliate sul singolo account", () => {
  it("una password sbagliata conta un tentativo, senza email", async () => {
    const { service, prisma, emailService } = buildService({});
    await expect(service.login("mario@example.it", "sbagliata1")).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { failedLoginCount: { increment: 1 } } }));
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it(`alla ${LOGIN_MAX_FAILURES}a di fila si ferma per 15 minuti e avvisa il titolare`, async () => {
    const { service, prisma, emailService } = buildService({ failedLoginCount: LOGIN_MAX_FAILURES - 1 });
    prisma.user.update.mockResolvedValue({ failedLoginCount: LOGIN_MAX_FAILURES });
    const error = await service.login("mario@example.it", "sbagliata1").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
    expect((error as HttpException).message).toContain("riprova tra 15 minuti");
    const lock = prisma.user.updateMany.mock.calls[0]![0].data;
    expect(lock.failedLoginCount).toBe(0);
    expect(lock.loginLockedUntil.getTime() - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ to: "mario@example.it", subject: "Troppi tentativi di accesso al tuo account" }));
  });

  it("durante la pausa non entra nemmeno con la password giusta", async () => {
    const { service } = buildService({ loginLockedUntil: new Date(Date.now() + 5 * 60_000) });
    await expect(service.login("mario@example.it", PASSWORD)).rejects.toThrow("riprova tra 5 minuti");
  });

  it("finita la pausa entra, e un accesso riuscito azzera il conto", async () => {
    const { service, prisma } = buildService({ failedLoginCount: 3, loginLockedUntil: new Date(Date.now() - 1000) });
    await expect(service.login("mario@example.it", PASSWORD)).resolves.toEqual({ token: "jwt-token", isNewUser: false });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "u-1" }, data: { failedLoginCount: 0, loginLockedUntil: null } });
  });
});

describe("email per l'accesso da un dispositivo nuovo", () => {
  it("parte per un professionista, da un dispositivo mai visto", async () => {
    const { service, prisma, emailService } = buildService({});
    await service.login("mario@example.it", PASSWORD, DEVICE);
    const created = prisma.loginDevice.create.mock.calls[0]![0].data;
    expect(created.deviceHash).toBe(createHash("sha256").update(DEVICE.id).digest("hex"));
    expect(created.label).toBe("Chrome su Windows");
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({ subject: "Nuovo accesso al tuo account" }));
  });

  it("non parte da un dispositivo già visto", async () => {
    const { service, prisma, emailService } = buildService({});
    prisma.loginDevice.updateMany.mockResolvedValue({ count: 1 });
    await service.login("mario@example.it", PASSWORD, DEVICE);
    expect(prisma.loginDevice.create).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });

  it("non parte per il primo dispositivo ricordato", async () => {
    const first = buildService({});
    first.prisma.loginDevice.count.mockResolvedValue(0);
    await first.service.login("mario@example.it", PASSWORD, DEVICE);
    expect(first.prisma.loginDevice.create).toHaveBeenCalled();
    expect(first.emailService.send).not.toHaveBeenCalled();
  });

  it("niente per i clienti o senza codice del dispositivo, e un errore non blocca l'accesso", async () => {
    const client = buildService({ role: "CLIENT" });
    await client.service.login("mario@example.it", PASSWORD, DEVICE);
    expect(client.prisma.loginDevice.updateMany).not.toHaveBeenCalled();

    const noDevice = buildService({});
    await noDevice.service.login("mario@example.it", PASSWORD, { userAgent: DEVICE.userAgent });
    expect(noDevice.prisma.loginDevice.updateMany).not.toHaveBeenCalled();

    const broken = buildService({});
    broken.prisma.loginDevice.updateMany.mockRejectedValue(new Error("db giù"));
    await expect(broken.service.login("mario@example.it", PASSWORD, DEVICE)).resolves.toEqual({ token: "jwt-token", isNewUser: false });
  });

  it("codice del dispositivo e nome del browser", () => {
    expect(loginDeviceHash({ id: "corto" })).toBeNull();
    expect(loginDeviceHash({ id: "<script>alert(1)</script>-xxxxxx" })).toBeNull();
    expect(loginDeviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari su iPhone");
    expect(loginDeviceLabel("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36 EdgA/130.0")).toBe("Edge su Android");
    expect(loginDeviceLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7; rv:131.0) Gecko/20100101 Firefox/131.0")).toBe("Firefox su Mac");
    expect(loginDeviceLabel(undefined)).toBe("un browser");
  });
});
