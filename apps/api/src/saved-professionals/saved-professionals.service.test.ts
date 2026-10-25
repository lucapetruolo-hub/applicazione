import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@professionisti/database";
import { SavedProfessionalsService } from "./saved-professionals.service";

/** Professionisti salvati: la media non conta le recensioni nascoste da un admin (§144, docs/CHANGELOG.md §342). */
describe("SavedProfessionalsService.listForUser", () => {
  it("esclude le recensioni nascoste dalla media e dal numero", async () => {
    const review = (rating: number, hidden = false) => ({ status: "COMPLETED", updatedAt: new Date("2026-01-10T00:00:00Z"), review: { rating, hiddenAt: hidden ? new Date() : null } });
    const prisma = {
      savedProfessional: {
        findMany: vi.fn().mockResolvedValue([
          {
            professionalProfile: {
              id: "pro-1",
              businessName: "Luigi Bianchi Idraulica",
              category: { slug: "idraulico", label: "Idraulico" },
              extraCategories: [],
              bookings: [review(5), review(4), review(1, true)],
              visibilityBoosts: [],
              services: [],
              fiscalProfile: null,
              subTags: [],
              spokenLanguages: [],
              createdAt: new Date("2026-01-01T00:00:00Z"),
            },
          },
        ]),
      },
    } as unknown as PrismaClient;

    const [pro] = await new SavedProfessionalsService(prisma).listForUser("user-1");

    expect(pro).toMatchObject({ rating: 4.5, reviewCount: 2 });
  });
});
