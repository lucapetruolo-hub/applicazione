import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import type { ProfessionalFiscalProfileInput, SetFiscalVerificationInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";

const FISCAL_FIELDS = [
  "entityType",
  "fiscalFirstName",
  "fiscalLastName",
  "fiscalCodiceFiscale",
  "dateOfBirth",
  "placeOfBirth",
  "countryOfBirth",
  "businessName",
  "legalForm",
  "vatNumber",
  "businessRegistrationNumber",
  "taxResidenceCountry",
  "foreignTin",
  "registeredStreet",
  "registeredCity",
  "registeredPostalCode",
  "registeredProvince",
  "registeredCountry",
] as const;

/**
 * Dati fiscali del professionista (persona fisica/impresa) — CLAUDE.md §88.
 * Modello separato da ProfessionalsService (che gestisce il profilo
 * pubblico): mai esposto in alcun endpoint pubblico/di ricerca, coerente
 * con la separazione rigorosa dati pubblici/dati fiscali richiesta dalla
 * specifica. Ogni modifica a un campo produce un AuditLog per-campo (mai
 * un solo evento "profilo aggiornato" generico) — richiesta esplicita
 * della specifica: "mai sovrascrivere un dato fiscale senza uno storico
 * versionato".
 */
@Injectable()
export class ProfessionalFiscalService {
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
  ) {
    this.stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
  }

  private frontendUrl(): string {
    return process.env.FRONTEND_URL ?? "http://localhost:3000";
  }

  private async requireMyProfileId(userId: string): Promise<string> {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException("Completa prima il tuo profilo professionista.");
    return profile.id;
  }

  async getMine(userId: string) {
    const professionalProfileId = await this.requireMyProfileId(userId);
    return this.prisma.professionalFiscalProfile.findUnique({
      where: { professionalProfileId },
      include: { representative: true },
    });
  }

  async getForAdmin(professionalProfileId: string) {
    const profile = await this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId } });
    if (!profile) throw new NotFoundException("Professionista non trovato.");
    const fiscalProfile = await this.prisma.professionalFiscalProfile.findUnique({
      where: { professionalProfileId },
      include: { representative: true },
    });
    const auditLog = fiscalProfile ? await this.auditLogService.history("ProfessionalFiscalProfile", fiscalProfile.id) : [];
    return { businessName: profile.businessName, fiscalProfile, auditLog };
  }

  async upsertMine(userId: string, input: ProfessionalFiscalProfileInput) {
    const professionalProfileId = await this.requireMyProfileId(userId);
    const existing = await this.prisma.professionalFiscalProfile.findUnique({
      where: { professionalProfileId },
      include: { representative: true },
    });

    const data: Record<string, unknown> = {};
    for (const field of FISCAL_FIELDS) {
      const value = input[field];
      if (value === undefined) continue;
      data[field] = field === "dateOfBirth" ? (value ? new Date(value as string) : null) : value || null;
    }
    // Un cambio ai dati fiscali riporta lo stato di verifica a UNVERIFIED —
    // un admin aveva verificato il dato PRECEDENTE, non quello nuovo (mai
    // trattare una verifica come valida a prescindere dal contenuto).
    if (Object.keys(data).length > 0 && existing?.verificationStatus === "VERIFIED") {
      data.verificationStatus = "REQUIRES_UPDATE";
      data.verifiedAt = null;
    }

    const fiscalProfile = existing
      ? await this.prisma.professionalFiscalProfile.update({ where: { professionalProfileId }, data })
      : await this.prisma.professionalFiscalProfile.create({ data: { professionalProfileId, ...data } });

    for (const field of FISCAL_FIELDS) {
      if (input[field] === undefined) continue;
      const oldValue = existing ? (existing as unknown as Record<string, unknown>)[field] : undefined;
      const newValue = (fiscalProfile as unknown as Record<string, unknown>)[field];
      if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) continue;
      await this.auditLogService.record({
        entityType: "ProfessionalFiscalProfile",
        entityId: fiscalProfile.id,
        fieldName: field,
        oldValue,
        newValue,
        changedByUserId: userId,
      });
    }

    if (input.representative) {
      const rep = input.representative;
      await this.prisma.fiscalRepresentative.upsert({
        where: { fiscalProfileId: fiscalProfile.id },
        update: { firstName: rep.firstName, lastName: rep.lastName, codiceFiscale: rep.codiceFiscale || null, role: rep.role || null },
        create: {
          fiscalProfileId: fiscalProfile.id,
          firstName: rep.firstName,
          lastName: rep.lastName,
          codiceFiscale: rep.codiceFiscale || null,
          role: rep.role || null,
        },
      });
      await this.auditLogService.record({
        entityType: "FiscalRepresentative",
        entityId: fiscalProfile.id,
        newValue: rep,
        changedByUserId: userId,
      });
    }

    return this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId }, include: { representative: true } });
  }

  async setVerification(professionalProfileId: string, input: SetFiscalVerificationInput, adminUserId: string) {
    const fiscalProfile = await this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId } });
    if (!fiscalProfile) throw new NotFoundException("Il professionista non ha ancora compilato i dati fiscali.");

    const updated = await this.prisma.professionalFiscalProfile.update({
      where: { professionalProfileId },
      data: {
        verificationStatus: input.status,
        verificationNote: input.note || null,
        verifiedAt: input.status === "VERIFIED" ? new Date() : null,
      },
    });
    await this.auditLogService.record({
      entityType: "ProfessionalFiscalProfile",
      entityId: fiscalProfile.id,
      fieldName: "verificationStatus",
      oldValue: fiscalProfile.verificationStatus,
      newValue: input.status,
      changedByUserId: adminUserId,
      reason: input.note,
    });
    return updated;
  }

  /**
   * Onboarding Stripe Connect — gated: senza STRIPE_SECRET_KEY risponde con
   * un errore chiaro invece di un crash, stesso pattern già in uso per
   * Stripe/Cloudinary in tutto il progetto (CLAUDE.md §9). Crea l'account
   * Connect alla prima chiamata (Express, il tipo più semplice per un
   * onboarding guidato da Stripe), poi genera sempre un nuovo Account Link
   * (scadono dopo pochi minuti, mai riutilizzabile).
   */
  async createStripeConnectOnboardingLink(userId: string) {
    if (!this.stripe) {
      throw new BadRequestException(
        "I pagamenti tramite Manovia non sono ancora configurati su questo ambiente. Aggiungi STRIPE_SECRET_KEY per attivarli.",
      );
    }
    const professionalProfileId = await this.requireMyProfileId(userId);
    const profile = await this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, include: { user: true } });
    let fiscalProfile = await this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId } });

    let stripeAccountId = fiscalProfile?.stripeConnectAccountId;
    if (!stripeAccountId) {
      const account = await this.stripe.accounts.create({
        type: "express",
        country: "IT",
        email: profile?.user.email ?? undefined,
        business_type: fiscalProfile?.entityType === "BUSINESS" ? "company" : "individual",
      });
      stripeAccountId = account.id;
      fiscalProfile = fiscalProfile
        ? await this.prisma.professionalFiscalProfile.update({ where: { professionalProfileId }, data: { stripeConnectAccountId: stripeAccountId } })
        : await this.prisma.professionalFiscalProfile.create({ data: { professionalProfileId, stripeConnectAccountId: stripeAccountId } });
      await this.auditLogService.record({
        entityType: "ProfessionalFiscalProfile",
        entityId: fiscalProfile.id,
        fieldName: "stripeConnectAccountId",
        newValue: stripeAccountId,
        changedByUserId: userId,
        reason: "Creazione account Stripe Connect.",
      });
    }

    const accountLink = await this.stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${this.frontendUrl()}/dashboard/profilo?stripeConnect=refresh`,
      return_url: `${this.frontendUrl()}/dashboard/profilo?stripeConnect=completato`,
      type: "account_onboarding",
    });
    return { url: accountLink.url };
  }

  /** Aggiorna lo stato Stripe Connect dal webhook `account.updated`. */
  async syncStripeConnectStatus(stripeAccountId: string, chargesEnabled: boolean, payoutsEnabled: boolean, requirementsStatus: string | null) {
    const fiscalProfile = await this.prisma.professionalFiscalProfile.findUnique({ where: { stripeConnectAccountId: stripeAccountId } });
    if (!fiscalProfile) return;
    await this.prisma.professionalFiscalProfile.update({
      where: { id: fiscalProfile.id },
      data: { stripeChargesEnabled: chargesEnabled, stripePayoutsEnabled: payoutsEnabled, stripeRequirementsStatus: requirementsStatus },
    });
  }
}
