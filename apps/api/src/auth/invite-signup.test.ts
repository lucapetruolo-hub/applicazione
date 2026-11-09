import { describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

/** "Porta un collega" e link dei partner: chi ha portato il nuovo professionista (docs/changelog/2026-11-09-passaparola.md). */
describe("invito alla registrazione", () => {
  function build() {
    const prisma = {
      invitePartner: { findUnique: vi.fn().mockResolvedValue({ id: "partner-1", archivedAt: null }) },
      professionalProfile: { findUnique: vi.fn().mockResolvedValue({ id: "pro-1", deletedAt: null }) },
    };
    const service = new AuthService(prisma as never, {} as never, {} as never, {} as never, {} as never);
    const inviteFields = (code?: string) => (service as unknown as { inviteFields: (c?: string) => Promise<Record<string, string>> }).inviteFields(code);
    return { prisma, inviteFields };
  }

  it("6 caratteri: il collega; 7: il partner; niente codice: niente", async () => {
    const { inviteFields } = build();
    await expect(inviteFields("k7m2qa")).resolves.toEqual({ invitedByProfessionalId: "pro-1" });
    await expect(inviteFields("k7m2qab")).resolves.toEqual({ invitedByPartnerId: "partner-1" });
    await expect(inviteFields(undefined)).resolves.toEqual({});
  });

  it("un collega eliminato o un partner tolto non bloccano l'iscrizione: si ignorano", async () => {
    const { prisma, inviteFields } = build();
    prisma.professionalProfile.findUnique.mockResolvedValueOnce({ id: "pro-1", deletedAt: new Date() });
    await expect(inviteFields("k7m2qa")).resolves.toEqual({});
    prisma.invitePartner.findUnique.mockResolvedValueOnce({ id: "partner-1", archivedAt: new Date() });
    await expect(inviteFields("k7m2qab")).resolves.toEqual({});
    prisma.invitePartner.findUnique.mockResolvedValueOnce(null);
    await expect(inviteFields("k7m2qab")).resolves.toEqual({});
  });
});
