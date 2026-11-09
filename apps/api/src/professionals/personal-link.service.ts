import { randomInt } from "node:crypto";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type PrismaClient } from "@professionisti/database";
import {
  isInvitePartnerCode,
  isPersonalLinkCode,
  personalLinkPath,
  type InviteSender,
  PERSONAL_LINK_ALPHABET,
  PERSONAL_LINK_CODE_LENGTH,
  type MyPersonalLink,
} from "@professionisti/shared";
import qrcode from "qrcode-generator";
import { PRISMA } from "../prisma/prisma.module";
import { frontendUrl } from "../email/email-brand";
import { SubscriptionsService } from "../subscriptions/subscriptions.service";
import { COUNTED_USER, countingFrom, daySinceLaunch } from "../site-counts/counted";

/** Mezzanotte UTC del giorno, come i contatori per giorno (ProfileViewDay). */
function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Un codice nuovo a caso; con 31^6 (circa 900 milioni) combinazioni una collisione è rarissima e si riprova. */
export function newPersonalLinkCode(): string {
  let code = "";
  for (let i = 0; i < PERSONAL_LINK_CODE_LENGTH; i += 1) code += PERSONAL_LINK_ALPHABET[randomInt(PERSONAL_LINK_ALPHABET.length)];
  return code;
}

/** QR del link completo in SVG, con il margine bianco che serve ai lettori dei telefoni. */
export function personalLinkQrSvg(url: string): string {
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  return qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true });
}

/**
 * Link personale del professionista (docs/changelog/2026-11-08-canale-del-professionista.md):
 * `/p/<codice>` porta al suo profilo e le richieste partite da lì sono
 * clienti suoi (non contano nei lavori del mese).
 */
@Injectable()
export class PersonalLinkService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async getMine(userId: string): Promise<MyPersonalLink> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true, businessName: true, personalLinkCode: true, deletedAt: true },
    });
    if (!profile || profile.deletedAt) throw new NotFoundException("Profilo professionista non trovato. Completa prima il tuo profilo.");
    const code = profile.personalLinkCode ?? (await this.assignCode(profile.id));
    const path = personalLinkPath(code);
    const usage = await this.subscriptions.personalLinkUsage(profile.id);
    // Aperture del link nel periodo dei lavori, dal lancio (CLAUDE.md §5 punto 17,
    // docs/changelog/2026-11-09-passaparola.md).
    const fromDay = daySinceLaunch(utcDay(usage.period.start), countingFrom());
    const [opens, colleaguesInvited, reviews] = await Promise.all([
      this.prisma.profileViewDay.aggregate({
        where: { professionalProfileId: profile.id, day: { gte: fromDay, lt: usage.period.end } },
        _sum: { linkCount: true },
      }),
      this.prisma.user.count({ where: { invitedByProfessionalId: profile.id, deletedAt: null, ...COUNTED_USER } }),
      this.reviewSummary(profile.id),
    ]);
    return {
      code,
      path,
      qrSvg: personalLinkQrSvg(`${frontendUrl()}${path}`),
      businessName: profile.businessName,
      requestsThisPeriod: usage.requests,
      jobsThisPeriod: usage.jobs,
      opensThisPeriod: opens._sum.linkCount ?? 0,
      colleaguesInvited,
      ...reviews,
    };
  }

  /** Voto medio e numero delle recensioni visibili, come sul profilo pubblico. */
  private async reviewSummary(professionalProfileId: string): Promise<{ rating: number | null; reviewCount: number }> {
    const reviews = await this.prisma.review.aggregate({
      where: { hiddenAt: null, booking: { professionalProfileId } },
      _avg: { rating: true },
      _count: { _all: true },
    });
    const reviewCount = reviews._count._all;
    const avg = reviews._avg.rating;
    return { rating: reviewCount > 0 && avg != null ? Math.round(avg * 10) / 10 : null, reviewCount };
  }

  /** Il codice si crea una volta sola e non cambia: è stampato su biglietti e furgoni. */
  private async assignCode(professionalProfileId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = newPersonalLinkCode();
      try {
        // Due aperture insieme: vince la prima, la seconda rilegge il codice già scritto.
        const updated = await this.prisma.professionalProfile.updateMany({
          where: { id: professionalProfileId, personalLinkCode: null },
          data: { personalLinkCode: code },
        });
        if (updated.count === 1) return code;
        const current = await this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, select: { personalLinkCode: true } });
        if (current?.personalLinkCode) return current.personalLinkCode;
      } catch (err) {
        // Codice già usato da un altro professionista: se ne prova un altro.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
    throw new Error("Link personale: nessun codice libero dopo 5 tentativi.");
  }

  /**
   * Dal codice al profilo, per il reindirizzamento di `/p/<codice>`. Solo i
   * dati che servono all'indirizzo del profilo; un profilo eliminato,
   * sospeso o non ancora confermato non si trova, come nella pagina profilo.
   */
  async resolve(code: string): Promise<{ id: string; businessName: string; city: string | null; rating: number | null; reviewCount: number }> {
    const normalized = code.trim().toLowerCase();
    if (!isPersonalLinkCode(normalized)) throw new NotFoundException("Link non trovato.");
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { personalLinkCode: normalized },
      select: { id: true, businessName: true, city: true, deletedAt: true, suspendedAt: true, invitePendingAt: true },
    });
    if (!profile || profile.deletedAt || profile.suspendedAt || profile.invitePendingAt) throw new NotFoundException("Link non trovato.");
    // Voto e recensioni servono al bollino per il sito del professionista.
    return { id: profile.id, businessName: profile.businessName, city: profile.city, ...(await this.reviewSummary(profile.id)) };
  }

  /**
   * Chi ha mandato un invito "Porta un collega" o un link di partner
   * (docs/changelog/2026-11-09-passaparola.md), per la riga "Ti ha invitato
   * …" su /per-professionisti. Solo il nome già pubblico.
   */
  async resolveInvite(code: string): Promise<InviteSender> {
    const normalized = code.trim().toLowerCase();
    if (isInvitePartnerCode(normalized)) {
      const partner = await this.prisma.invitePartner.findUnique({ where: { code: normalized }, select: { name: true, archivedAt: true } });
      if (!partner || partner.archivedAt) throw new NotFoundException("Invito non trovato.");
      return { kind: "PARTNER", name: partner.name };
    }
    const pro = await this.resolve(normalized).catch(() => null);
    if (!pro) throw new NotFoundException("Invito non trovato.");
    return { kind: "PROFESSIONAL", name: pro.businessName };
  }
}
