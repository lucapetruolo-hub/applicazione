import { randomInt } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@professionisti/database";
import { INVITE_PARTNER_CODE_LENGTH, PERSONAL_LINK_ALPHABET, type AdminInvitePartner, type InvitePartnerCreateInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { COUNTED_USER } from "../site-counts/counted";

/** Codice nuovo di 7 caratteri: non coincide mai con un link personale (6). */
export function newInvitePartnerCode(): string {
  let code = "";
  for (let i = 0; i < INVITE_PARTNER_CODE_LENGTH; i += 1) code += PERSONAL_LINK_ALPHABET[randomInt(PERSONAL_LINK_ALPHABET.length)];
  return code;
}

/**
 * Link d'invito dei partner (commercialisti, associazioni di artigiani,
 * docs/changelog/2026-11-09-passaparola.md): Luca ne crea uno per partner in
 * Admin → Andamento e vede quanti professionisti si iscrivono da lì. Nessuna
 * commissione: non si paga nessuno per un iscritto.
 */
@Injectable()
export class InvitePartnersService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async list(): Promise<AdminInvitePartner[]> {
    const rows = await this.prisma.invitePartner.findMany({
      where: { archivedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        createdAt: true,
        _count: { select: { invitedUsers: { where: { role: "PROFESSIONAL", deletedAt: null, ...COUNTED_USER } } } },
      },
    });
    return rows.map((row) => ({ id: row.id, name: row.name, code: row.code, createdAt: row.createdAt.toISOString(), signups: row._count.invitedUsers }));
  }

  async create(input: InvitePartnerCreateInput): Promise<AdminInvitePartner> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        const row = await this.prisma.invitePartner.create({ data: { name: input.name, code: newInvitePartnerCode() } });
        return { id: row.id, name: row.name, code: row.code, createdAt: row.createdAt.toISOString(), signups: 0 };
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
    throw new Error("Link dei partner: nessun codice libero dopo 5 tentativi.");
  }

  /** Il link smette di valere per le iscrizioni nuove; chi si è già iscritto resta contato. */
  async archive(id: string): Promise<void> {
    const updated = await this.prisma.invitePartner.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
    if (updated.count === 0) throw new NotFoundException("Link non trovato.");
  }
}
