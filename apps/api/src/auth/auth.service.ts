import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { LEGAL_CONSENT_VERSION, type EmailStatus } from "@professionisti/shared";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { EmailService } from "../email/email.service";
import { frontendUrl } from "../email/email-brand";
import {
  accountDeletedEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verifyEmailEmail,
  welcomeClientEmail,
  welcomeProfessionalEmail,
} from "../email/templates/account-emails";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { SUSPENDED_ACCOUNT_MESSAGE } from "./jwt-auth.guard";
import { googleNameFields, googleNameRepair } from "./google-name";

const BCRYPT_SALT_ROUNDS = 10;
/** Validità del link di conferma email (docs/CHANGELOG.md §178). */
const EMAIL_TOKEN_HOURS = 48;
/** Validità del link per reimpostare la password (docs/CHANGELOG.md §185). */
const PASSWORD_RESET_MINUTES = 60;

function hashEmailToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type AuthResult = { token: string; isNewUser: boolean };

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly emailService: EmailService,
    private readonly cloudinaryService: CloudinaryService,
  ) {
    this.googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;
  }

  /**
   * Metriche di affidabilità (CLAUDE.md §15, evento 7): un login conta come
   * "attività" solo per un account professionista che ha già creato il
   * proprio profilo (senza ProfessionalProfile non esiste ancora un
   * professionalProfileId su cui agganciare la riga di metriche).
   */
  private async touchProfessionalActivity(userId: string, role: string): Promise<void> {
    if (role !== "PROFESSIONAL") return;
    const profile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (profile) {
      await this.professionalMetricsService.touchActivity(profile.id);
    }
  }

  /**
   * Primo passo dell'accesso "prima l'email" (docs/CHANGELOG.md §176): dice
   * solo se l'email ha già un account e come si entra. Rivela che un'email è
   * registrata, come MioDottore: scelta accettata dall'utente, con il limite
   * di richieste sul controller. Stessa ricerca esatta di `register`/`login`,
   * così la risposta non contraddice mai il passo successivo.
   */
  async emailStatus(email: string): Promise<EmailStatus> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: { passwordHash: true, googleId: true } });
    if (!user) return "new";
    if (!user.passwordHash && user.googleId) return "google";
    return "password";
  }

  async register(email: string, password: string, name?: string, role: "CLIENT" | "PROFESSIONAL" = "CLIENT"): Promise<AuthResult> {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException("Esiste già un account con questa email.");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    // `acceptedLegalTerms`/`declaredAdult` sono già garantite `=== true` da
    // `registerSchema` (Zod `.refine`) prima di arrivare qui — richiesta
    // esplicita dell'utente ("Verbale di Conformità", art. 7 GDPR): prima
    // nessun atto tracciato confermava che l'utente avesse letto le
    // informative né dichiarato la maggiore età.
    const user = await this.prisma.user.create({
      data: { email, passwordHash, name, role, legalConsentAt: new Date(), legalConsentVersion: LEGAL_CONSENT_VERSION },
    });
    // Benvenuto (docs/CHANGELOG.md §185). Al professionista contiene anche
    // il link di conferma email (§178), al cliente no: non deve confermare nulla.
    if (role === "PROFESSIONAL") {
      await this.sendVerificationEmail(user.id, email, name ?? null, "welcome");
    } else {
      await this.emailService.send({ to: email, ...welcomeClientEmail(name ?? null) });
    }

    return { token: this.issueToken(user.id), isNewUser: true };
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException("Email o password non corretti.");
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException("Email o password non corretti.");
    }
    if (user.suspendedAt) {
      throw new ForbiddenException(SUSPENDED_ACCOUNT_MESSAGE);
    }

    await this.touchProfessionalActivity(user.id, user.role);
    return { token: this.issueToken(user.id), isNewUser: false };
  }

  async verifyGoogleToken(
    idToken: string,
    role?: "CLIENT" | "PROFESSIONAL",
    createIfMissing = true,
    legalConsent?: { acceptedLegalTerms: boolean; declaredAdult: boolean },
  ): Promise<AuthResult> {
    if (!this.googleClient) {
      throw new BadRequestException("Login con Google non configurato su questo ambiente.");
    }

    let payload: { sub?: string; email?: string; name?: string; given_name?: string; family_name?: string; picture?: string } | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch {
      throw new UnauthorizedException("Token Google non valido o scaduto.");
    }
    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException("Token Google non valido.");
    }

    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: payload.sub }, { email: payload.email }] },
    });

    // Bug reale segnalato dall'utente: "Accedi con Google" su un'email mai
    // registrata creava comunque silenziosamente un account CLIENT, invece
    // di far capire che non esiste ancora nessun account e rimandare alla
    // scelta cliente/professionista su /registrati (dove createIfMissing
    // resta true, il default: lì "non esiste ancora" è il caso normale).
    if (!existingUser && !createIfMissing) {
      throw new NotFoundException("Nessun account trovato con questa email.");
    }
    // Stessa doppia dichiarazione obbligatoria di `register()` (v. sopra),
    // qui applicata solo quando questa chiamata crea davvero un nuovo
    // account — un login su un account esistente non la richiede mai.
    if (!existingUser && (!legalConsent?.acceptedLegalTerms || !legalConsent.declaredAdult)) {
      throw new BadRequestException("Devi accettare Privacy Policy e Termini di Servizio e dichiarare di avere almeno 18 anni.");
    }

    // Foto dell'account Google come immagine profilo, se l'account non ne
    // ha già una (l'utente può sempre cambiarla da /account o dal profilo).
    const imageUrl =
      payload.picture && !existingUser?.imageUrl ? await this.cloudinaryService.uploadImageFromUrl(payload.picture, "professionisti") : null;

    const user =
      existingUser ??
      (await this.prisma.user.create({
        data: {
          googleId: payload.sub,
          email: payload.email,
          ...googleNameFields(payload),
          imageUrl,
          role: role ?? "CLIENT",
          legalConsentAt: new Date(),
          legalConsentVersion: LEGAL_CONSENT_VERSION,
          // Google ha già verificato l'indirizzo: nessun link da confermare.
          emailVerifiedAt: new Date(),
        },
      }));

    if (existingUser?.suspendedAt) {
      throw new ForbiddenException(SUSPENDED_ACCOUNT_MESSAGE);
    }

    if (existingUser && !existingUser.googleId) {
      await this.prisma.user.update({ where: { id: existingUser.id }, data: { googleId: payload.sub } });
    }
    // Account creati con Google prima della correzione avevano nome e
    // cognome tutti nel campo nome: al primo accesso si sistemano, solo se
    // il cognome manca e il nome è ancora quello completo di Google.
    const nameFix = existingUser ? googleNameRepair(existingUser, payload) : null;
    if (existingUser && (nameFix || imageUrl)) {
      await this.prisma.user.update({ where: { id: existingUser.id }, data: { ...nameFix, ...(imageUrl ? { imageUrl } : {}) } });
    }
    // Accedere con Google sulla stessa email ne dimostra il possesso. Una
    // password scelta prima della conferma potrebbe essere di chi si è
    // iscritto con l'email di un altro: si azzera, il titolare può
    // sceglierne una nuova da /account. Solo per i professionisti, gli unici
    // a cui si chiede la conferma.
    if (existingUser && existingUser.role !== "CLIENT" && !existingUser.emailVerifiedAt && existingUser.email === payload.email) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: { emailVerifiedAt: new Date(), emailTokenHash: null, emailTokenExpiresAt: null, passwordHash: null },
      });
    }

    if (existingUser) {
      await this.touchProfessionalActivity(user.id, user.role);
    } else if (user.email) {
      // Benvenuto anche a chi si iscrive con Google (docs/CHANGELOG.md §185): email già verificata, nessun link.
      const name = user.name ? user.name.split(" ")[0]! : null;
      await this.emailService.send({ to: user.email, ...(user.role === "PROFESSIONAL" ? welcomeProfessionalEmail(name, null) : welcomeClientEmail(name)) });
    }
    return { token: this.issueToken(user.id), isNewUser: !existingUser };
  }

  async updateAccount(
    userId: string,
    data: {
      name?: string;
      surname?: string;
      birthDate?: string;
      email?: string;
      phone?: string;
      street?: string;
      houseNumber?: string;
      addressExtra?: string;
      postalCode?: string;
      city?: string;
      province?: string;
    },
  ) {
    let emailChanged = false;
    if (data.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (existing && existing.id !== userId) {
        throw new ConflictException("Esiste già un account con questa email.");
      }
      emailChanged = existing === null;
    }
    if (data.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone: data.phone } });
      if (existing && existing.id !== userId) {
        throw new ConflictException("Esiste già un account con questo numero di telefono.");
      }
    }

    const { birthDate, ...rest } = data;
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...rest,
        ...(birthDate ? { birthDate: new Date(birthDate) } : {}),
        // Un indirizzo nuovo va confermato di nuovo (docs/CHANGELOG.md §178).
        ...(emailChanged ? { emailVerifiedAt: null } : {}),
      },
    });
    if (emailChanged && updated.email && updated.role !== "CLIENT") {
      await this.sendVerificationEmail(updated.id, updated.email, updated.name, "verify");
    }
    return updated;
  }

  /**
   * Conferma email (docs/CHANGELOG.md §178): genera un nuovo link (quello
   * precedente smette di valere) e lo invia. Non blocca mai il chiamante se
   * l'email non parte: l'utente può farla rispedire.
   */
  private async sendVerificationEmail(userId: string, email: string, name: string | null, mode: "welcome" | "verify"): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailTokenHash: hashEmailToken(token), emailTokenExpiresAt: new Date(Date.now() + EMAIL_TOKEN_HOURS * 60 * 60 * 1000) },
    });
    const link = `${frontendUrl()}/conferma-email?token=${encodeURIComponent(token)}`;
    await this.emailService.send({
      to: email,
      ...(mode === "welcome" ? welcomeProfessionalEmail(name, { link, hours: EMAIL_TOKEN_HOURS }) : verifyEmailEmail(name, link, EMAIL_TOKEN_HOURS)),
    });
  }

  async resendVerificationEmail(userId: string): Promise<{ alreadyVerified: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email || user.deletedAt !== null) {
      throw new NotFoundException("Account non trovato.");
    }
    if (user.emailVerifiedAt) return { alreadyVerified: true };
    await this.sendVerificationEmail(user.id, user.email, user.name, "verify");
    return { alreadyVerified: false };
  }

  async verifyEmail(token: string): Promise<{ email: string }> {
    const user = await this.prisma.user.findUnique({ where: { emailTokenHash: hashEmailToken(token) } });
    if (!user?.email || user.deletedAt !== null || !user.emailTokenExpiresAt || user.emailTokenExpiresAt < new Date()) {
      throw new BadRequestException("Il link di conferma non è valido o è scaduto. Accedi e chiedi un nuovo link.");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date(), emailTokenHash: null, emailTokenExpiresAt: null },
    });
    return { email: user.email };
  }

  async changePassword(userId: string, currentPassword: string | undefined, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("Utente non trovato.");
    }

    if (user.passwordHash) {
      if (!currentPassword) {
        throw new BadRequestException("Inserisci la password attuale.");
      }
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        throw new UnauthorizedException("Password attuale non corretta.");
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    if (user.email) await this.emailService.send({ to: user.email, ...passwordChangedEmail(user.name) });
  }

  /**
   * Recupero password (docs/CHANGELOG.md §185): manda un link valido
   * PASSWORD_RESET_MINUTES minuti, una volta sola. Risponde sempre allo stesso
   * modo, che l'account esista o no. Vale anche per chi si è iscritto con
   * Google: così può aggiungere una password.
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.email || user.deletedAt !== null) return;
    const token = randomBytes(32).toString("base64url");
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordResetTokenHash: hashEmailToken(token), passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_MINUTES * 60 * 1000) },
    });
    const link = `${frontendUrl()}/reimposta-password?token=${encodeURIComponent(token)}`;
    await this.emailService.send({ to: user.email, ...passwordResetEmail(user.name, link, PASSWORD_RESET_MINUTES) });
  }

  /**
   * Nuova password dal link: annulla il link, conferma l'email (aprire il
   * link ne dimostra il possesso) ed entra subito nell'account.
   */
  async confirmPasswordReset(token: string, password: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { passwordResetTokenHash: hashEmailToken(token) } });
    if (!user?.email || user.deletedAt !== null || !user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
      throw new BadRequestException("Il link per reimpostare la password non è valido o è scaduto. Chiedine uno nuovo.");
    }
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        emailTokenHash: null,
        emailTokenExpiresAt: null,
      },
    });
    await this.emailService.send({ to: user.email, ...passwordChangedEmail(user.name) });
    if (user.suspendedAt) {
      throw new ForbiddenException(SUSPENDED_ACCOUNT_MESSAGE);
    }
    return { token: this.issueToken(user.id), isNewUser: false };
  }

  /**
   * Soft-delete (richiesta esplicita dell'utente): non cancella più
   * fisicamente lo User, per non trascinare via in cascata le richieste
   * guidate/lead/preventivi/prenotazioni/recensioni collegate — devono
   * restare visibili al professionista con l'indicazione "Account
   * eliminato" invece di sparire. Se l'account è un professionista, anche
   * il suo ProfessionalProfile è ora soft-deleted (`deletedAt`, stesso
   * principio) invece di cancellato per davvero come in origine — bug/
   * lacuna corretta su richiesta esplicita dell'utente: cancellarlo per
   * davvero portava via in cascata (onDelete: Cascade) anche Booking/Review
   * del cliente, che perdeva ogni traccia dei propri "Lavori accettati"
   * passati con lui. Il profilo resta comunque escluso da ricerca/profilo
   * pubblico/fan-out (ogni query pubblica filtra esplicitamente
   * `deletedAt: null`), ma Booking/Lead/Quote/Review restano intatti.
   */
  async deleteAccount(userId: string): Promise<void> {
    const before = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (professionalProfile) {
      await this.prisma.professionalProfile.update({ where: { id: professionalProfile.id }, data: { deletedAt: new Date() } });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        // Libera email/telefono/googleId (unique) per permettere una nuova
        // registrazione allo stesso indirizzo — l'email anonimizzata non
        // può mai collidere con una vera perché non è un formato valido
        // per la registrazione (contiene l'id).
        email: `deleted-${userId}@deleted.invalid`,
        phone: null,
        googleId: null,
        passwordHash: null,
        emailTokenHash: null,
        name: null,
        surname: null,
        birthDate: null,
        imageUrl: null,
        passwordResetTokenHash: null,
      },
    });
    // Conferma all'indirizzo di prima, già tolto dall'account (docs/CHANGELOG.md §185).
    if (before?.email) await this.emailService.send({ to: before.email, ...accountDeletedEmail(before.name) });
  }

  /**
   * Esportazione dei propri dati personali (richiesta esplicita dell'utente,
   * "Verbale di Conformità" — art. 20 GDPR, diritto alla portabilità: era
   * già dichiarato in Privacy Policy senza che esistesse alcuna funzione
   * reale per esercitarlo). Copre le principali entità che portano dati
   * personali dell'utente, non ogni riga collegata nel database.
   *
   * Attenzione a `professionalNote` su `Booking`: è privata del
   * professionista, mai vista dal cliente in nessun punto del prodotto
   * (CLAUDE.md) — esclusa esplicitamente qui quando si esporta il lato
   * cliente di una prenotazione, altrimenti l'export stesso diventerebbe un
   * modo per far trapelare al cliente una nota che l'app non gli mostra mai.
   */
  async exportMyData(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.deletedAt !== null) {
      throw new NotFoundException("Account non trovato.");
    }
    const { passwordHash: _passwordHash, googleId: _googleId, ...account } = user;

    const [guidedRequests, bookingsAsClient, reviewsWritten, clientReviewsReceived, savedProfessionals, professionalProfile] =
      await Promise.all([
        this.prisma.guidedRequest.findMany({
          where: { clientId: userId },
          include: { quotes: { include: { items: true } } },
          orderBy: { createdAt: "desc" },
        }),
        this.prisma.booking.findMany({
          where: { clientId: userId },
          select: {
            id: true,
            scheduledAt: true,
            scheduledEndAt: true,
            status: true,
            recipientName: true,
            recipientSurname: true,
            recipientPhone: true,
            street: true,
            houseNumber: true,
            addressExtra: true,
            postalCode: true,
            city: true,
            province: true,
            finalAmountEurCents: true,
            finalItems: true,
            cancellationNote: true,
            canceledBy: true,
            meetingLink: true,
            refundRequested: true,
            refundRequestedAt: true,
            serviceMode: true,
            createdAt: true,
            updatedAt: true,
            // `professionalNote` volutamente esclusa, v. commento sul metodo.
          },
          orderBy: { scheduledAt: "desc" },
        }),
        this.prisma.review.findMany({ where: { booking: { clientId: userId } }, orderBy: { createdAt: "desc" } }),
        this.prisma.clientReview.findMany({ where: { clientId: userId }, orderBy: { createdAt: "desc" } }),
        this.prisma.savedProfessional.findMany({ where: { userId } }),
        this.prisma.professionalProfile.findUnique({ where: { userId } }),
      ]);

    let professional: Record<string, unknown> | null = null;
    if (professionalProfile) {
      const [services, availabilitySlots, leads, quotesSent, bookingsAsProfessional, reviewsReceived, clientReviewsWritten, externalJobs] =
        await Promise.all([
          this.prisma.professionalService.findMany({ where: { professionalProfileId: professionalProfile.id } }),
          this.prisma.availabilitySlot.findMany({ where: { professionalProfileId: professionalProfile.id } }),
          this.prisma.lead.findMany({ where: { professionalProfileId: professionalProfile.id }, orderBy: { createdAt: "desc" } }),
          this.prisma.quote.findMany({
            where: { professionalProfileId: professionalProfile.id },
            include: { items: true },
            orderBy: { createdAt: "desc" },
          }),
          // Qui `professionalNote` resta inclusa: è contenuto scritto dal
          // professionista stesso su una propria prenotazione, non un dato
          // che appartiene alla controparte.
          this.prisma.booking.findMany({
            where: { professionalProfileId: professionalProfile.id },
            orderBy: { scheduledAt: "desc" },
          }),
          this.prisma.review.findMany({ where: { booking: { professionalProfileId: professionalProfile.id } }, orderBy: { createdAt: "desc" } }),
          this.prisma.clientReview.findMany({
            where: { booking: { professionalProfileId: professionalProfile.id } },
            orderBy: { createdAt: "desc" },
          }),
          this.prisma.externalJob.findMany({ where: { professionalProfileId: professionalProfile.id }, orderBy: { scheduledAt: "desc" } }),
        ]);
      professional = { profile: professionalProfile, services, availabilitySlots, leads, quotesSent, bookingsAsProfessional, reviewsReceived, clientReviewsWritten, externalJobs };
    }

    return {
      exportedAt: new Date().toISOString(),
      account,
      guidedRequests,
      bookingsAsClient,
      reviewsWritten,
      clientReviewsReceived,
      savedProfessionals,
      professional,
    };
  }

  private issueToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }
}
