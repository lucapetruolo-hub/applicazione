import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminGuard } from "./admin.guard";

/** Ruoli admin separati (docs/CHANGELOG.md §145). */
const ENABLED_AT = new Date("2026-10-01T10:00:00Z");
const verifiedNow = () => Math.floor(Date.now() / 1000);

function run(
  user: { role: string; adminRoles: string[]; adminTotpEnabledAt?: Date | null } | null,
  scope: string | undefined,
  adminVerifiedAt: number | null = verifiedNow(),
) {
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user && { adminTotpEnabledAt: ENABLED_AT, ...user }) } };
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(scope) };
  const guard = new AdminGuard(prisma as never, reflector as never);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: "u1", adminVerifiedAt: adminVerifiedAt ?? undefined } }) }),
    getHandler: () => null,
    getClass: () => null,
  };
  return guard.canActivate(context as never);
}

describe("AdminGuard — ruoli admin", () => {
  it("un non admin non entra mai", async () => {
    await expect(run({ role: "CLIENT", adminRoles: [] }, undefined)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("un super admin entra ovunque", async () => {
    await expect(run({ role: "ADMIN", adminRoles: ["SUPER"] }, "FINANCE")).resolves.toBe(true);
    await expect(run({ role: "ADMIN", adminRoles: ["SUPER"] }, "SUPER")).resolves.toBe(true);
  });
  it("un admin senza ruolo (creato prima dei ruoli) vale come super", async () => {
    await expect(run({ role: "ADMIN", adminRoles: [] }, "SUPER")).resolves.toBe(true);
  });
  it("il moderatore non entra nella finanza né nelle sezioni super", async () => {
    await expect(run({ role: "ADMIN", adminRoles: ["MODERATOR"] }, "MODERATION")).resolves.toBe(true);
    await expect(run({ role: "ADMIN", adminRoles: ["MODERATOR"] }, "FINANCE")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run({ role: "ADMIN", adminRoles: ["MODERATOR"] }, "SUPER")).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("moderatore + finanza entra in entrambe le aree ma non in quelle super", async () => {
    await expect(run({ role: "ADMIN", adminRoles: ["MODERATOR", "FINANCE"] }, "MODERATION")).resolves.toBe(true);
    await expect(run({ role: "ADMIN", adminRoles: ["MODERATOR", "FINANCE"] }, "FINANCE")).resolves.toBe(true);
    await expect(run({ role: "ADMIN", adminRoles: ["MODERATOR", "FINANCE"] }, "SUPER")).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("la finanza non entra nella moderazione ma vede le rotte comuni", async () => {
    await expect(run({ role: "ADMIN", adminRoles: ["FINANCE"] }, "MODERATION")).rejects.toBeInstanceOf(ForbiddenException);
    await expect(run({ role: "ADMIN", adminRoles: ["FINANCE"] }, undefined)).resolves.toBe(true);
  });
});

/** Verifica in due passaggi obbligatoria (docs/CHANGELOG.md §359). */
describe("AdminGuard — verifica in due passaggi", () => {
  const codeOf = async (promise: Promise<unknown>) => {
    const error = await promise.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    return ((error as ForbiddenException).getResponse() as { code?: string }).code;
  };
  it("senza verifica attivata chiede di attivarla", async () => {
    expect(await codeOf(run({ role: "ADMIN", adminRoles: ["SUPER"], adminTotpEnabledAt: null }, undefined))).toBe("ADMIN_2FA_SETUP");
  });
  it("senza codice nel token, o con un codice di più di 8 ore fa, lo chiede", async () => {
    expect(await codeOf(run({ role: "ADMIN", adminRoles: ["SUPER"] }, undefined, null))).toBe("ADMIN_2FA_REQUIRED");
    expect(await codeOf(run({ role: "ADMIN", adminRoles: ["SUPER"] }, undefined, verifiedNow() - 9 * 3600))).toBe("ADMIN_2FA_REQUIRED");
  });
  it("un codice dato prima di riattivare la verifica non vale", async () => {
    const enabledLater = new Date(Date.now() - 60_000);
    expect(await codeOf(run({ role: "ADMIN", adminRoles: ["SUPER"], adminTotpEnabledAt: enabledLater }, undefined, verifiedNow() - 3600))).toBe(
      "ADMIN_2FA_REQUIRED",
    );
  });
  it("un non admin riceve il solito rifiuto, senza codici", async () => {
    expect(await codeOf(run({ role: "CLIENT", adminRoles: [] }, undefined))).toBeUndefined();
  });
});
