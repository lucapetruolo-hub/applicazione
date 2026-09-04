import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";

export type AdminUserRow = {
  email: string | null;
  name: string | null;
  surname: string | null;
  businessName: string | null;
  createdAt: string;
};

@Injectable()
export class AdminService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async listUsersByRole(): Promise<{ clients: AdminUserRow[]; professionals: AdminUserRow[]; admins: AdminUserRow[] }> {
    // Tutti i ruoli, ADMIN incluso: prima venivano lette solo CLIENT/PROFESSIONAL,
    // quindi un'email appena promossa via /admin/bootstrap spariva del tutto da
    // questa pagina invece di comparire come admin — sembrava che la
    // promozione non fosse stata salvata (bug reale segnalato dall'utente),
    // mentre in realtà era salvata sul DB ma semplicemente mai mostrata qui.
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        email: true,
        name: true,
        surname: true,
        role: true,
        createdAt: true,
        professionalProfile: { select: { businessName: true } },
      },
    });

    const toRow = (u: (typeof users)[number]): AdminUserRow => ({
      email: u.email,
      name: u.name,
      surname: u.surname,
      businessName: u.professionalProfile?.businessName ?? null,
      createdAt: u.createdAt.toISOString(),
    });

    return {
      clients: users.filter((u) => u.role === "CLIENT").map(toRow),
      professionals: users.filter((u) => u.role === "PROFESSIONAL").map(toRow),
      admins: users.filter((u) => u.role === "ADMIN").map(toRow),
    };
  }

  /**
   * Email raccolte dal riquadro "Arriviamo presto nella tua zona"
   * (homepage, sotto la soglia di professionisti reali per mostrare la
   * vetrina — CLAUDE.md §10 Fase 4) — richiesta esplicita dell'utente:
   * "salvale in un elenco visualizzabile dai profili admin". Erano già
   * scritte su `WaitlistSignup` da `WaitlistService.signup`, mai lette da
   * nessun endpoint prima d'ora.
   */
  async listWaitlist(): Promise<{ email: string; createdAt: string }[]> {
    const signups = await this.prisma.waitlistSignup.findMany({ orderBy: { createdAt: "desc" } });
    return signups.map((s) => ({ email: s.email, createdAt: s.createdAt.toISOString() }));
  }

  async promoteToAdmin(email: string): Promise<{ email: string; role: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException("Nessun utente registrato con questa email.");
    }
    const updated = await this.prisma.user.update({ where: { email }, data: { role: "ADMIN" } });
    return { email: updated.email as string, role: updated.role };
  }
}
