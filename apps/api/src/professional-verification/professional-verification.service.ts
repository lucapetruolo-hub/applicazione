import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@professionisti/database";
import type { ProfessionalVerificationFilter, ProfessionalVerificationRow } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Verifica manuale dei professionisti (docs/CHANGELOG.md §200): un admin
 * controlla documento d'identità e partita IVA (o codice fiscale) fuori dal
 * sito e qui assegna o toglie il badge "Verificato". Ogni cambio finisce nel
 * registro azioni e il professionista riceve un avviso.
 */
@Injectable()
export class ProfessionalVerificationService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(filter: ProfessionalVerificationFilter, q: string): Promise<ProfessionalVerificationRow[]> {
    const search = q.trim();
    const where: Prisma.ProfessionalProfileWhereInput = {
      deletedAt: null,
      invitePendingAt: null,
      isDemo: false,
      verified: filter === "verified",
      ...(search
        ? {
            OR: [
              { businessName: { contains: search, mode: "insensitive" } },
              { city: { contains: search, mode: "insensitive" } },
              { user: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const profiles = await this.prisma.professionalProfile.findMany({
      where,
      orderBy:
        filter === "verified"
          ? [{ verifiedAt: "desc" }]
          : // Prima chi ha chiesto la verifica (docs/CHANGELOG.md §201), poi i più vecchi.
            [{ verificationRequestedAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 200,
      include: {
        category: { select: { label: true } },
        user: { select: { id: true, email: true, name: true, surname: true, phone: true } },
        fiscalProfile: { select: { vatNumber: true, fiscalCodiceFiscale: true } },
      },
    });
    const verifierIds = [...new Set(profiles.map((p) => p.verifiedByUserId).filter((id): id is string => !!id))];
    const verifiers = verifierIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: verifierIds } }, select: { id: true, name: true, surname: true, email: true } })
      : [];
    const verifierName = new Map(verifiers.map((u) => [u.id, [u.name, u.surname].filter(Boolean).join(" ") || u.email || "Admin"]));

    return profiles.map((profile) => ({
      professionalProfileId: profile.id,
      userId: profile.user.id,
      businessName: profile.businessName,
      ownerName: [profile.user.name, profile.user.surname].filter(Boolean).join(" "),
      email: profile.user.email ?? "",
      phone: profile.user.phone,
      categoryLabel: profile.category.label,
      city: profile.city,
      createdAt: profile.createdAt.toISOString(),
      vatNumber: profile.fiscalProfile?.vatNumber ?? null,
      codiceFiscale: profile.fiscalProfile?.fiscalCodiceFiscale ?? null,
      hasLiabilityInsurance: profile.hasLiabilityInsurance,
      verified: profile.verified,
      verificationRequestedAt: profile.verificationRequestedAt?.toISOString() ?? null,
      verifiedAt: profile.verifiedAt?.toISOString() ?? null,
      verifiedByName: profile.verifiedByUserId ? (verifierName.get(profile.verifiedByUserId) ?? null) : null,
      verificationNote: profile.verificationNote,
    }));
  }

  async verify(adminUserId: string, professionalProfileId: string, note?: string) {
    const profile = await this.findActive(professionalProfileId);
    if (profile.verified) throw new BadRequestException("Il profilo è già verificato.");
    const now = new Date();
    await this.prisma.professionalProfile.update({
      where: { id: profile.id },
      data: { verified: true, verifiedAt: now, verifiedByUserId: adminUserId, verificationNote: note || null, verificationRequestedAt: null },
    });
    await this.auditLogService.record({
      entityType: "ProfessionalProfile",
      entityId: profile.id,
      fieldName: "verified",
      oldValue: false,
      newValue: true,
      changedByUserId: adminUserId,
      reason: note || "Documento d'identità e partita IVA/codice fiscale controllati",
    });
    await this.notificationsService.notify(profile.userId, "PROFILE_VERIFIED", {});
    return { professionalProfileId: profile.id, verified: true, verifiedAt: now.toISOString() };
  }

  async unverify(adminUserId: string, professionalProfileId: string, note: string) {
    const profile = await this.findActive(professionalProfileId);
    if (!profile.verified) throw new BadRequestException("Il profilo non è verificato.");
    await this.prisma.professionalProfile.update({
      where: { id: profile.id },
      data: { verified: false, verifiedAt: null, verifiedByUserId: null, verificationNote: note },
    });
    await this.auditLogService.record({
      entityType: "ProfessionalProfile",
      entityId: profile.id,
      fieldName: "verified",
      oldValue: true,
      newValue: false,
      changedByUserId: adminUserId,
      reason: note,
    });
    await this.notificationsService.notify(profile.userId, "PROFILE_VERIFICATION_REMOVED", { note });
    return { professionalProfileId: profile.id, verified: false, verifiedAt: null };
  }

  /**
   * "Richiedi la verifica" da /dashboard/profilo (docs/CHANGELOG.md §201):
   * il profilo sale in cima a "Da verificare" e il menu admin lo conta.
   */
  async requestVerification(userId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { userId },
      select: { id: true, verified: true, verificationRequestedAt: true, deletedAt: true, invitePendingAt: true },
    });
    if (!profile || profile.deletedAt) throw new NotFoundException("Completa prima il tuo profilo professionista.");
    if (profile.invitePendingAt) throw new BadRequestException("Conferma prima il tuo profilo.");
    if (profile.verified) throw new BadRequestException("Il tuo profilo è già verificato.");
    if (profile.verificationRequestedAt) return { verificationRequestedAt: profile.verificationRequestedAt.toISOString() };
    const now = new Date();
    await this.prisma.professionalProfile.update({ where: { id: profile.id }, data: { verificationRequestedAt: now } });
    return { verificationRequestedAt: now.toISOString() };
  }

  /** Richieste di verifica in attesa, per il numero nel menu admin. */
  countPendingRequests(): Promise<number> {
    return this.prisma.professionalProfile.count({
      where: { verificationRequestedAt: { not: null }, verified: false, deletedAt: null, invitePendingAt: null },
    });
  }

  /**
   * Il professionista ha cambiato un dato controllato (partita IVA, codice
   * fiscale, nome dell'attività): la verifica valeva per il dato vecchio,
   * quindi il badge si toglie da solo e il profilo torna "Da verificare".
   */
  async revokeAfterOwnChange(professionalProfileId: string, changedByUserId: string, reason: string): Promise<void> {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { id: true, userId: true, verified: true },
    });
    if (!profile?.verified) return;
    await this.prisma.professionalProfile.update({
      where: { id: profile.id },
      data: { verified: false, verifiedAt: null, verifiedByUserId: null, verificationNote: reason },
    });
    await this.auditLogService.record({
      entityType: "ProfessionalProfile",
      entityId: profile.id,
      fieldName: "verified",
      oldValue: true,
      newValue: false,
      changedByUserId,
      reason,
    });
    await this.notificationsService.notify(profile.userId, "PROFILE_VERIFICATION_REMOVED", { note: reason });
  }

  private async findActive(professionalProfileId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({
      where: { id: professionalProfileId },
      select: { id: true, userId: true, verified: true, deletedAt: true, invitePendingAt: true },
    });
    if (!profile || profile.deletedAt) throw new NotFoundException("Profilo non trovato.");
    if (profile.invitePendingAt) throw new BadRequestException("Il professionista non ha ancora confermato il profilo.");
    return profile;
  }
}
