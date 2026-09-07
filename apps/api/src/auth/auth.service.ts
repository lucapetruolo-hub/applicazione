import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { LEGAL_CONSENT_VERSION } from "@professionisti/shared";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";

const BCRYPT_SALT_ROUNDS = 10;

export type AuthResult = { token: string; isNewUser: boolean };

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
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

    let payload: { sub?: string; email?: string; name?: string } | undefined;
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

    const user =
      existingUser ??
      (await this.prisma.user.create({
        data: {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name,
          role: role ?? "CLIENT",
          legalConsentAt: new Date(),
          legalConsentVersion: LEGAL_CONSENT_VERSION,
        },
      }));

    if (existingUser && !existingUser.googleId) {
      await this.prisma.user.update({ where: { id: existingUser.id }, data: { googleId: payload.sub } });
    }

    if (existingUser) {
      await this.touchProfessionalActivity(user.id, user.role);
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
    if (data.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
      if (existing && existing.id !== userId) {
        throw new ConflictException("Esiste già un account con questa email.");
      }
    }
    if (data.phone) {
      const existing = await this.prisma.user.findUnique({ where: { phone: data.phone } });
      if (existing && existing.id !== userId) {
        throw new ConflictException("Esiste già un account con questo numero di telefono.");
      }
    }

    const { birthDate, ...rest } = data;
    return this.prisma.user.update({
      where: { id: userId },
      data: { ...rest, ...(birthDate ? { birthDate: new Date(birthDate) } : {}) },
    });
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
        name: null,
        surname: null,
        birthDate: null,
        imageUrl: null,
      },
    });
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
