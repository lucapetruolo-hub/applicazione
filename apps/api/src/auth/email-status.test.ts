import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

function serviceWith(user: { passwordHash: string | null; googleId: string | null } | null) {
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } };
  return new AuthService(prisma as never, {} as never, {} as never, {} as never);
}

describe("AuthService.emailStatus — accesso prima l'email (docs/CHANGELOG.md §176)", () => {
  it("email senza account: new", async () => {
    await expect(serviceWith(null).emailStatus("nuovo@esempio.it")).resolves.toBe("new");
  });

  it("account con password: password", async () => {
    await expect(serviceWith({ passwordHash: "hash", googleId: null }).emailStatus("a@esempio.it")).resolves.toBe("password");
  });

  it("account con password e Google: password", async () => {
    await expect(serviceWith({ passwordHash: "hash", googleId: "g-1" }).emailStatus("a@esempio.it")).resolves.toBe("password");
  });

  it("account solo Google: google", async () => {
    await expect(serviceWith({ passwordHash: null, googleId: "g-1" }).emailStatus("a@esempio.it")).resolves.toBe("google");
  });
});
