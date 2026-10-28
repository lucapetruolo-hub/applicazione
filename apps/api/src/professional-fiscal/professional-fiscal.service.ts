import { BadRequestException, Inject, Injectable, Logger, NotFoundException, Optional } from "@nestjs/common";
import Stripe from "stripe";
import type { PrismaClient } from "@professionisti/database";
import {
  BRAND,
  FISCAL_DECLARATION_VERSION,
  fiscalDataMissing,
  fiscalFieldErrors,
  parseInvoiceRecipient,
  type ProfessionalFiscalProfileInput,
  type SetFiscalVerificationInput,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { AuditLogService } from "../audit-log/audit-log.service";
import { NotificationsService } from "../notifications/notifications.service";
import { ProfessionalVerificationService } from "../professional-verification/professional-verification.service";
import { TaxIdCheckService } from "../tax-id-check/tax-id-check.service";
import { readStripeConnectStatus } from "./stripe-connect-status";
import { identityVerificationNeeded } from "../identity-verification/identity-provider-env";
import { PayoutAccountService } from "./payout-account.service";

/** Solo le ultime 4 cifre di un codice fiscale, per il registro delle modifiche. */
export function maskTaxId(value: unknown): unknown {
  return typeof value === "string" && value ? `••••${value.slice(-4)}` : value;
}

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
  "leiCode",
  "additionalEuStates",
  "taxResidenceCountry",
  "foreignTin",
  "fiscalIdIssuingCountry",
  "registeredStreet",
  "registeredHouseNumber",
  "registeredCity",
  "registeredPostalCode",
  "registeredProvince",
  "registeredCountry",
] as const;

/** Campi per i documenti (§378): nel registro delle modifiche, ma senza toccare la verifica. */
const DOCUMENT_FIELDS = ["chargesVat", "sdiRecipientCode", "pecEmail"] as const;

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

  private readonly logger = new Logger(ProfessionalFiscalService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly auditLogService: AuditLogService,
    private readonly professionalVerificationService: ProfessionalVerificationService,
    private readonly notificationsService: NotificationsService,
    private readonly taxIdCheckService: TaxIdCheckService,
    @Optional() private readonly payoutAccountService?: PayoutAccountService,
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
    const fiscalProfile = await this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId }, select: { stripeConnectAccountId: true, stripePayoutsEnabled: true } });
    // Di ritorno dalla verifica Stripe il webhook può non essere ancora
    // arrivato: lo stato si rilegge da Stripe finché l'account non è attivo.
    if (fiscalProfile?.stripeConnectAccountId && !fiscalProfile.stripePayoutsEnabled) {
      await this.refreshStripeConnectStatus(fiscalProfile.stripeConnectAccountId).catch((err: unknown) => {
        this.logger.warn(`Stato Stripe non riletto per ${fiscalProfile.stripeConnectAccountId}: ${err instanceof Error ? err.message : String(err)}`);
      });
    }
    return this.prisma.professionalFiscalProfile.findUnique({
      where: { professionalProfileId },
      include: { representative: true, taxIdChecks: true },
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

    // Stessi controlli del browser anche qui (docs/CHANGELOG.md §253): forma
    // di codice fiscale e P.IVA e coerenza del codice fiscale con nome,
    // cognome e data di nascita. Prima una chiamata diretta all'API li saltava.
    const fieldErrors = fiscalFieldErrors({
      entityType: input.entityType ?? existing?.entityType,
      fiscalIdIssuingCountry: input.fiscalIdIssuingCountry ?? existing?.fiscalIdIssuingCountry,
      fiscalFirstName: input.fiscalFirstName ?? existing?.fiscalFirstName,
      fiscalLastName: input.fiscalLastName ?? existing?.fiscalLastName,
      fiscalCodiceFiscale: input.fiscalCodiceFiscale ?? existing?.fiscalCodiceFiscale,
      dateOfBirth: input.dateOfBirth ?? existing?.dateOfBirth,
      vatNumber: input.vatNumber ?? existing?.vatNumber,
      representative: input.representative ?? existing?.representative,
    });
    if (fieldErrors.length > 0) throw new BadRequestException(fieldErrors[0]?.message);

    const data: Record<string, unknown> = {};
    for (const field of FISCAL_FIELDS) {
      const value = input[field];
      if (value === undefined) continue;
      data[field] = field === "dateOfBirth" ? (value ? new Date(value as string) : null) : value || null;
    }
    // Un cambio ai dati fiscali riporta lo stato di verifica a UNVERIFIED —
    // un admin aveva verificato il dato PRECEDENTE, non quello nuovo (mai
    // trattare una verifica come valida a prescindere dal contenuto).
    if (FISCAL_FIELDS.some((field) => field in data) && existing?.verificationStatus === "VERIFIED") {
      data.verificationStatus = "REQUIRES_UPDATE";
      data.verifiedAt = null;
    }
    // Dichiarazione fiscale richiesta esplicitamente al salvataggio (mai un
    // `false` inviato dal client — un salvataggio senza spunta è bloccato
    // già lato UI, qui è solo difensivo): stesso pattern di
    // `User.legalConsentAt`/`legalConsentVersion` per il consenso di
    // registrazione, mai retroattivo su un'accettazione già data a una
    // versione precedente del testo.
    if (input.fiscalDeclarationAccepted) {
      data.fiscalDeclarationAcceptedAt = new Date();
      data.fiscalDeclarationVersion = FISCAL_DECLARATION_VERSION;
    }

    // IVA nelle sue fatture e codice destinatario o PEC (docs/CHANGELOG.md
    // §378): servono ai documenti, non cambiano la persona né la verifica.
    if (input.chargesVat !== undefined) data.chargesVat = input.chargesVat;
    if (input.invoiceRecipient !== undefined) {
      const recipient = parseInvoiceRecipient(input.invoiceRecipient);
      if (!recipient.ok) throw new BadRequestException(recipient.error);
      data.sdiRecipientCode = recipient.sdiRecipientCode;
      data.pecEmail = recipient.pecEmail;
    }

    let fiscalProfile = existing
      ? await this.prisma.professionalFiscalProfile.update({ where: { professionalProfileId }, data })
      : await this.prisma.professionalFiscalProfile.create({ data: { professionalProfileId, ...data } });
    // Dati minimi per essere pubblici (docs/CHANGELOG.md §241).
    const complete = fiscalDataMissing(fiscalProfile).length === 0;
    if (complete !== !!fiscalProfile.fiscalDataCompleteAt) {
      fiscalProfile = await this.prisma.professionalFiscalProfile.update({
        where: { professionalProfileId },
        data: { fiscalDataCompleteAt: complete ? new Date() : null },
      });
    }

    for (const field of [...FISCAL_FIELDS, ...DOCUMENT_FIELDS]) {
      if (!(field in data)) continue;
      const oldValue = existing ? (existing as unknown as Record<string, unknown>)[field] : undefined;
      const newValue = (fiscalProfile as unknown as Record<string, unknown>)[field];
      if (JSON.stringify(oldValue ?? null) === JSON.stringify(newValue ?? null)) continue;
      // Il codice fiscale nel registro solo con le ultime 4 cifre: nel
      // database è cifrato, una copia in chiaro qui lo vanificherebbe (§292).
      const secret = field === "fiscalCodiceFiscale";
      await this.auditLogService.record({
        entityType: "ProfessionalFiscalProfile",
        entityId: fiscalProfile.id,
        fieldName: field,
        oldValue: secret ? maskTaxId(oldValue) : oldValue,
        newValue: secret ? maskTaxId(newValue) : newValue,
        changedByUserId: userId,
      });
    }

    // Badge "Verificato": documento e selfie valgono per la persona dei dati
    // fiscali di allora (docs/CHANGELOG.md §253). Se cambia la persona (nome,
    // cognome, data di nascita, codice fiscale, tipo o legale rappresentante)
    // la verifica va rifatta; la sola P.IVA la ricontrolla Openapi qui sotto.
    const personChanged =
      !!existing &&
      ((["entityType", "fiscalFirstName", "fiscalLastName", "fiscalCodiceFiscale"] as const).some(
        (field) => input[field] !== undefined && (existing[field] ?? null) !== (fiscalProfile[field] ?? null),
      ) ||
        (input.dateOfBirth !== undefined && (existing.dateOfBirth?.getTime() ?? null) !== (fiscalProfile.dateOfBirth?.getTime() ?? null)) ||
        (input.representative !== undefined &&
          fiscalProfile.entityType === "BUSINESS" &&
          (existing.representative?.firstName !== input.representative.firstName ||
            existing.representative?.lastName !== input.representative.lastName ||
            (existing.representative?.codiceFiscale ?? null) !== (input.representative.codiceFiscale || null))));
    if (personChanged) {
      await this.professionalVerificationService.revokeAfterOwnChange(
        professionalProfileId,
        userId,
        "Hai cambiato i dati della persona nei dati fiscali: rifai la verifica dell'identità con documento e selfie.",
      );
    }

    if (input.fiscalDeclarationAccepted) {
      await this.auditLogService.record({
        entityType: "ProfessionalFiscalProfile",
        entityId: fiscalProfile.id,
        fieldName: "fiscalDeclarationAccepted",
        newValue: FISCAL_DECLARATION_VERSION,
        changedByUserId: userId,
        reason: "Dichiarazione di correttezza dei dati fiscali accettata al salvataggio.",
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
        newValue: { ...rep, codiceFiscale: maskTaxId(rep.codiceFiscale) },
        changedByUserId: userId,
      });
    }

    // Codice fiscale e P.IVA all'Agenzia delle Entrate / Registro Imprese
    // (Openapi, §253): subito, e solo per i dati nuovi o cambiati.
    await this.taxIdCheckService.syncForFiscalProfile(fiscalProfile.id, userId);

    return this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId }, include: { representative: true, taxIdChecks: true } });
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
   * alla prima chiamata, poi genera sempre un nuovo Account Link (scadono
   * dopo pochi minuti, mai riutilizzabile).
   *
   * Account Stripe Accounts v2 (docs/CHANGELOG.md §236), non più il vecchio
   * `type: "express"` che Stripe considera superato: configurazione
   * "destinatario" (riceve i trasferimenti dalla piattaforma, non incassa
   * carte), Dashboard Express, commissioni Stripe e perdite a carico della
   * piattaforma. I pagamenti dei lavori si addebitano "a destinazione" sul
   * suo conto con i bonifici verso la banca in manuale (docs/CHANGELOG.md
   * §249, impostati da OnlineMoneyService al primo pagamento).
   * Prima di creare il primo account va accettata la responsabilità delle
   * perdite nella Dashboard Stripe (Impostazioni Connect → profilo piattaforma).
   */
  /**
   * Accesso alla Dashboard Express di Stripe (docs/CHANGELOG.md §238): il
   * professionista vede accrediti e bonifici sul suo conto e cambia l'IBAN,
   * senza scrivere a noi. Solo con la verifica avviata.
   */
  async createStripeDashboardLink(userId: string): Promise<{ url: string }> {
    if (!this.stripe) throw new BadRequestException(`I pagamenti tramite ${BRAND.name} non sono ancora configurati su questo ambiente.`);
    const professionalProfileId = await this.requireMyProfileId(userId);
    const fiscalProfile = await this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId } });
    if (!fiscalProfile?.stripeConnectAccountId) throw new BadRequestException("Attiva prima i pagamenti con Stripe.");
    const link = await this.stripe.accounts.createLoginLink(fiscalProfile.stripeConnectAccountId);
    return { url: link.url };
  }

  async createStripeConnectOnboardingLink(userId: string) {
    if (!this.stripe) {
      throw new BadRequestException(
        `I pagamenti tramite ${BRAND.name} non sono ancora configurati su questo ambiente. Aggiungi STRIPE_SECRET_KEY per attivarli.`,
      );
    }
    const professionalProfileId = await this.requireMyProfileId(userId);
    const profile = await this.prisma.professionalProfile.findUnique({ where: { id: professionalProfileId }, include: { user: true } });
    let fiscalProfile = await this.prisma.professionalFiscalProfile.findUnique({ where: { professionalProfileId } });

    let stripeAccountId = fiscalProfile?.stripeConnectAccountId;
    // Pagamenti online solo dopo dati fiscali e verifica dell'identità
    // (richiesta dell'utente, docs/CHANGELOG.md §262). Chi li aveva già
    // iniziati prosegue.
    if (!stripeAccountId) {
      if (fiscalDataMissing(fiscalProfile).length > 0) throw new BadRequestException("Completa prima i dati fiscali.");
      if (profile && identityVerificationNeeded(profile)) throw new BadRequestException("Prima verifica la tua identità, poi puoi attivare i pagamenti online.");
    }
    if (!stripeAccountId) {
      const account = await this.stripe.v2.core.accounts.create(
        {
          contact_email: profile?.user.email ?? undefined,
          display_name: profile?.businessName ?? undefined,
          dashboard: "express",
          identity: { country: "IT", entity_type: fiscalProfile?.entityType === "BUSINESS" ? "company" : "individual" },
          // Merchant: i pagamenti dei lavori nascono sul suo conto (addebito
          // diretto, §268); recipient per i pagamenti dei modelli precedenti.
          configuration: {
            merchant: { capabilities: { card_payments: { requested: true } } },
            recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
          },
          defaults: { currency: "eur", locales: ["it-IT"], responsibilities: { fees_collector: "application", losses_collector: "application" } },
          metadata: { professionalProfileId },
        },
        { idempotencyKey: `connect-account-${professionalProfileId}` },
      );
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
    } else await this.ensureMerchantConfiguration(stripeAccountId);

    const accountLink = await this.stripe.v2.core.accountLinks.create({
      account: stripeAccountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: ["merchant", "recipient"],
          refresh_url: `${this.frontendUrl()}/dashboard/fiscale?stripeConnect=refresh`,
          return_url: `${this.frontendUrl()}/dashboard/fiscale?stripeConnect=completato`,
        },
      },
    });
    return { url: accountLink.url };
  }

  /**
   * Account creato prima dell'addebito diretto (§268), solo per ricevere
   * trasferimenti: gli si aggiunge la configurazione merchant per accettare
   * le carte. Stripe chiede i dati che mancano nella stessa verifica.
   */
  private async ensureMerchantConfiguration(stripeAccountId: string): Promise<void> {
    if (!this.stripe) return;
    // `applied_configurations` e non `include: ["configuration.merchant"]`:
    // con la Dashboard Express Stripe non fa leggere la configurazione alla
    // piattaforma dopo l'iscrizione (vedi readStripeConnectStatus).
    const account = await this.stripe.v2.core.accounts.retrieve(stripeAccountId);
    if (account.applied_configurations?.includes("merchant")) return;
    await this.stripe.v2.core.accounts.update(stripeAccountId, {
      configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
    });
  }

  /**
   * Rilegge da Stripe lo stato dell'account del professionista (webhook
   * `account.updated`, ritorno dalla verifica) e lo salva.
   */
  async refreshStripeConnectStatus(stripeAccountId: string): Promise<void> {
    if (!this.stripe) return;
    const status = await readStripeConnectStatus(this.stripe, stripeAccountId);
    // Pagamenti online attivi quando può accettare le carte (addebito diretto, §268).
    await this.syncStripeConnectStatus(stripeAccountId, status.cardPaymentsActive, status.cardPaymentsActive, status.requirements);
    // IBAN per la DAC7 di nuovo confrontato col conto su Stripe (§247): mai bloccante.
    await this.payoutAccountService?.recheckForStripeAccount(stripeAccountId).catch((err: unknown) => {
      this.logger.warn(`IBAN non ricontrollato per ${stripeAccountId}: ${err instanceof Error ? err.message : String(err)}`);
    });
  }

  /** Aggiorna lo stato Stripe Connect dal webhook `account.updated`. */
  async syncStripeConnectStatus(stripeAccountId: string, chargesEnabled: boolean, payoutsEnabled: boolean, requirementsStatus: string | null) {
    const fiscalProfile = await this.prisma.professionalFiscalProfile.findUnique({
      where: { stripeConnectAccountId: stripeAccountId },
      include: { professionalProfile: { select: { userId: true } } },
    });
    if (!fiscalProfile) return;
    await this.prisma.professionalFiscalProfile.update({
      where: { id: fiscalProfile.id },
      data: { stripeChargesEnabled: chargesEnabled, stripePayoutsEnabled: payoutsEnabled, stripeRequirementsStatus: requirementsStatus },
    });
    // Avviso al professionista quando l'account diventa attivo (docs/CHANGELOG.md §241)
    // o quando Stripe lo sospende (§242).
    if (payoutsEnabled && !fiscalProfile.stripePayoutsEnabled) {
      await this.notificationsService.notify(fiscalProfile.professionalProfile.userId, "STRIPE_ACCOUNT_ACTIVE", {});
    } else if (!payoutsEnabled && fiscalProfile.stripePayoutsEnabled) {
      await this.notificationsService.notify(fiscalProfile.professionalProfile.userId, "STRIPE_ACCOUNT_RESTRICTED", {});
    }
  }
}
