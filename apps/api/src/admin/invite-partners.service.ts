import { randomInt } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@professionisti/database";
import {
  BRAND,
  INVITE_PARTNER_CODE_LENGTH,
  PERSONAL_LINK_ALPHABET,
  SUBSCRIPTION_TIERS,
  formatEurCents,
  inviteLinkPath,
  type AdminInvitePartner,
  type InvitePartnerCreateInput,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { COUNTED_USER } from "../site-counts/counted";
import { frontendUrl } from "../email/email-brand";
import type { PdfDocumentModel } from "../accounting/document-pdf";

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

  /**
   * Scheda da stampare o mandare al partner (docs/changelog/2026-11-09-passaparola.md):
   * cosa offre il sito agli artigiani, il prezzo di partenza e il suo link con
   * il QR. Testi da intermediario (CLAUDE.md §5 punto 18): il prezzo lo fa il
   * professionista, nessuna promessa sui lavori. Nessuna offerta a tempo
   * scritta qui: cambia, e la scheda resta stampata.
   */
  async sheet(id: string): Promise<{ model: PdfDocumentModel; fileName: string }> {
    const partner = await this.prisma.invitePartner.findUnique({ where: { id }, select: { name: true, code: true, archivedAt: true } });
    if (!partner || partner.archivedAt) throw new NotFoundException("Link non trovato.");
    const base = SUBSCRIPTION_TIERS.find((tier) => tier.tier === "BASE")!;
    const model: PdfDocumentModel = {
      title: "Richieste di lavoro vicino a te",
      subtitle: `Te lo presenta ${partner.name}`,
      blocks: [
        {
          type: "text",
          lines: [
            "Un sito dove le persone della tua zona chiedono preventivi per i lavori di casa: tu ricevi le richieste, rispondi con il tuo preventivo e organizzi gli appuntamenti da un unico posto, dal telefono o dal computer.",
          ],
        },
        { type: "heading", text: "Cosa trovi" },
        {
          type: "rows",
          rows: [
            { label: "Richieste vicino a te", detail: "Con la descrizione del lavoro e le foto, nel raggio che scegli tu.", value: "" },
            { label: "Preventivi chiari", detail: "Voci, tempi e modo di pagamento. Il prezzo lo decidi sempre tu.", value: "" },
            { label: "Agenda e promemoria", detail: "Il cliente riceve il promemoria il giorno prima: meno appuntamenti saltati.", value: "" },
            { label: "Pagamenti", detail: "Acconto con carta online se vuoi, oppure pagamento diretto come sempre.", value: "" },
            { label: "Recensioni vere", detail: "Le lasciano solo i clienti con cui hai fatto un lavoro sul sito.", value: "" },
            { label: "Il tuo link", detail: "Un link e un QR da dare ai tuoi clienti: le loro richieste arrivano solo a te.", value: "" },
            { label: "Documenti in ordine", detail: "Fatture dell'abbonamento ed estratto del mese, da girare al commercialista.", value: "" },
          ],
        },
        { type: "heading", text: "Quanto costa" },
        {
          type: "text",
          lines: [
            `Un abbonamento con tutte le funzioni, da ${formatEurCents(base.priceEurCents)} + IVA al mese. Prezzi e offerte del momento li trovi sulla pagina per i professionisti. Va bene con o senza partita IVA.`,
          ],
        },
        {
          type: "qr",
          url: `${frontendUrl()}${inviteLinkPath(partner.code)}`,
          label: "Guarda come funziona e iscriviti",
          caption: "Inquadra il codice con il telefono, oppure scrivi l'indirizzo nel browser.",
        },
      ],
    };
    return { model, fileName: `${BRAND.name}-${partner.name}` };
  }

  /** Il link smette di valere per le iscrizioni nuove; chi si è già iscritto resta contato. */
  async archive(id: string): Promise<void> {
    const updated = await this.prisma.invitePartner.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
    if (updated.count === 0) throw new NotFoundException("Link non trovato.");
  }
}
