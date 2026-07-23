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

  async listUsersByRole(): Promise<{ clients: AdminUserRow[]; professionals: AdminUserRow[] }> {
    const users = await this.prisma.user.findMany({
      where: { role: { in: ["CLIENT", "PROFESSIONAL"] } },
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
    };
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
