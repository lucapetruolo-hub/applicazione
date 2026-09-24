import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { AdminGuard } from "./admin.guard";

/** Ruoli admin separati (docs/CHANGELOG.md §145). */
function run(user: { role: string; adminRoles: string[] } | null, scope: string | undefined) {
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(scope) };
  const guard = new AdminGuard(prisma as never, reflector as never);
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: "u1" } }) }),
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
