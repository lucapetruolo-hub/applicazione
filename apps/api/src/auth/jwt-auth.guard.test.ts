import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { JwtAuthGuard } from "./jwt-auth.guard";

function contextWith(authorization?: string) {
  const request: { headers: Record<string, string | undefined>; user?: unknown } = { headers: { authorization } };
  return { request, context: { switchToHttp: () => ({ getRequest: () => request }) } as never };
}

describe("JwtAuthGuard — account sospesi (docs/CHANGELOG.md §144)", () => {
  const jwt = { verify: vi.fn().mockReturnValue({ sub: "user-1" }) };

  it("lascia passare un utente attivo", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ suspendedAt: null }) } };
    const guard = new JwtAuthGuard(jwt as never, prisma as never);
    const { request, context } = contextWith("Bearer token");
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ userId: "user-1" });
  });

  it("blocca un utente sospeso anche con un token ancora valido", async () => {
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue({ suspendedAt: new Date() }) } };
    const guard = new JwtAuthGuard(jwt as never, prisma as never);
    await expect(guard.canActivate(contextWith("Bearer token").context)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("senza token risponde 401", async () => {
    const prisma = { user: { findUnique: vi.fn() } };
    const guard = new JwtAuthGuard(jwt as never, prisma as never);
    await expect(guard.canActivate(contextWith(undefined).context)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
