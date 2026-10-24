import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@professionisti/database";
import type { ProfessionalVerificationFilter, ProfessionalVerificationRow } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";

/**
 * Badge "Verificato" dei professionisti. Da docs/CHANGELOG.md §253 lo assegna
 * solo la verifica di documento e selfie (Didit, `markVerifiedByProvider`);
 * all'admin resta "Togli verifica" (la verifica manuale, §200, è stata tolta nel §330).
 * Ogni cambio finisce nel registro azioni e il professionista riceve un avviso.
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
        fiscalProfile: { select: { vatNumber: true, fiscalCodiceFiscale: true, taxIdChecks: { orderBy: { kind: "asc" } } } },
        identityVerifications: { orderBy: { createdAt: "desc" }, take: 1 },
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
      identity: profile.identityVerifications[0]
        ? {
            id: profile.identityVerifications[0].id,
            status: profile.identityVerifications[0].status,
            reason: profile.identityVerifications[0].reviewNote ?? profile.identityVerifications[0].reason,
            provider: profile.identityVerifications[0].provider,
            providerSessionId: profile.identityVerifications[0].providerSessionId,
            updatedAt: profile.identityVerifications[0].updatedAt.toISOString(),
          }
        : null,
      taxIdChecks: (profile.fiscalProfile?.taxIdChecks ?? []).map((c) => ({ kind: c.kind, status: c.status, detail: c.detail, officialName: c.officialName })),
    }));
  }

  /**
   * Documento e selfie approvati dal fornitore e intestati alla persona dei
   * dati fiscali (docs/CHANGELOG.md §253): badge "Verificato" senza admin.
   */
  async markVerifiedByProvider(professionalProfileId: string, provider: string): Promise<void> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, select: { id: true, userId: true, verified: true } });
    if (!profile || profile.verified) return;
    await this.prisma.professionalProfile.update({
      where: { id: profile.id },
      data: { verified: true, verifiedAt: new Date(), verifiedByUserId: null, verificationNote: null, verificationRequestedAt: null },
    });
    await this.auditLogService.record({
      entityType: "ProfessionalProfile",
      entityId: profile.id,
      fieldName: "verified",
      oldValue: false,
      newValue: true,
      reason: `Documento e selfie verificati da ${provider}, intestati alla persona dei dati fiscali`,
    });
    await this.notificationsService.notify(profile.userId, "PROFILE_VERIFIED", {});
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

  /** Richieste di verifica in attesa, per il numero nel menu admin. */
  countPendingRequests(): Promise<number> {
    return this.prisma.professionalProfile.count({
      // Nessun caso dubbio passa all'admin (docs/CHANGELOG.md §255): restano
      // solo le vecchie richieste manuali.
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
