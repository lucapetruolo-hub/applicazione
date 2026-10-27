import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException, Optional, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { EMAIL_CODE_LENGTH, LEGAL_CONSENT_VERSION, NO_CATEGORY_MESSAGE, NO_ENTITY_TYPE_MESSAGE, type EmailStatus, type ProfessionalEntityTypeValue } from "@professionisti/shared";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import { ProfessionalMetricsService } from "../professional-metrics/professional-metrics.service";
import { EmailService } from "../email/email.service";
import { frontendUrl } from "../email/email-brand";
import {
  accountDeletedEmail,
  loginLockedEmail,
  newDeviceLoginEmail,
  passwordChangedEmail,
  passwordResetEmail,
  verifyEmailEmail,
  welcomeClientEmail,
  welcomeProfessionalEmail,
} from "../email/templates/account-emails";
import { CloudinaryService } from "../cloudinary/cloudinary.service";
import { GeocodingService } from "../geocoding/geocoding.service";
import { SUSPENDED_ACCOUNT_MESSAGE, sessionExpiresIn, sessionTokenPayload } from "./jwt-auth.guard";
import { googleNameFields, googleNameRepair } from "./google-name";
import { assertPasswordWithoutEmail } from "./password-checks";
import { loginDeviceHash, loginDeviceLabel, type LoginDeviceInfo } from "./login-device";

const BCRYPT_SALT_ROUNDS = 10;
/** Validità del link di conferma email (docs/CHANGELOG.md §178). */
const EMAIL_TOKEN_HOURS = 48;
/** Validità del link per reimpostare la password (docs/CHANGELOG.md §185). */
const PASSWORD_RESET_MINUTES = 60;
/** Stesso messaggio per ogni errore del codice: non dice se l'account esiste (§245). */
const PASSWORD_RESET_CODE_ERROR = "Codice non corretto o scaduto. Controlla l'ultima email ricevuta oppure chiedine uno nuovo.";
/** Codice di 6 cifre nella stessa email del link (docs/CHANGELOG.md §243). */
export const EMAIL_CODE_MINUTES = 15;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
export const EMAIL_CODE_RESEND_SECONDS = 60;
/** Password sbagliate di fila sullo stesso account prima della pausa (§289). */
export const LOGIN_MAX_FAILURES = 10;
export const LOGIN_LOCK_MINUTES = 15;

function loginLockedMessage(lockedUntil: Date): string {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  return `Troppi tentativi con una password sbagliata. Per sicurezza riprova tra ${minutes === 1 ? "1 minuto" : `${minutes} minuti`}, oppure scegli una password nuova con "Password dimenticata?".`;
}

function hashEmailToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Impronta del codice legata all'account: lo stesso codice su due account dà due impronte diverse. */
function hashEmailCode(userId: string, code: string): string {
  return createHash("sha256").update(`${userId}:${code}`).digest("hex");
}

/** Secondi che mancano prima di poter chiedere un nuovo codice (0 = subito). */
export function emailCodeResendWait(sentAt: Date | null, now = new Date()): number {
  if (!sentAt) return 0;
  return Math.max(0, Math.ceil((sentAt.getTime() + EMAIL_CODE_RESEND_SECONDS * 1000 - now.getTime()) / 1000));
}

/**
 * Secondi di validità che restano al codice in corso (0 = nessun codice
 * valido: mai mandato, scaduto o tentativi finiti). Il sito lo usa per dire
 * subito che il codice è scaduto invece di farlo scoprire al primo errore.
 */
export function emailCodeValidFor(
  user: { emailCodeHash: string | null; emailCodeExpiresAt: Date | null; emailCodeAttempts: number },
  now = new Date(),
): number {
  if (!user.emailCodeHash || !user.emailCodeExpiresAt || user.emailCodeAttempts >= EMAIL_CODE_MAX_ATTEMPTS) return 0;
  return Math.max(0, Math.floor((user.emailCodeExpiresAt.getTime() - now.getTime()) / 1000));
}

/** Campi da azzerare quando l'email risulta confermata, in qualunque modo. */
const CLEARED_EMAIL_CHECKS = {
  emailTokenHash: null,
  emailTokenExpiresAt: null,
  emailCodeHash: null,
  emailCodeExpiresAt: null,
  emailCodeAttempts: 0,
} as const;

export type AuthResult = { token: string; isNewUser: boolean };

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client | null;
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
    private readonly professionalMetricsService: ProfessionalMetricsService,
    private readonly emailService: EmailService,
    private readonly cloudinaryService: CloudinaryService,
    // Facoltativo solo per i test che costruiscono il servizio a mano.
    @Optional() private readonly geocodingService?: GeocodingService,
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

  async register(
    email: string,
    password: string,
    name?: string,
    role: "CLIENT" | "PROFESSIONAL" = "CLIENT",
    categorySlugs: string[] = [],
    entityType?: ProfessionalEntityTypeValue,
    device?: LoginDeviceInfo,
  ): Promise<AuthResult> {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException("Esiste già un account con questa email.");
    }

    assertPasswordWithoutEmail(password, email);
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    // `acceptedLegalTerms`/`declaredAdult` sono già garantite `=== true` da
    // `registerSchema` (Zod `.refine`) prima di arrivare qui — richiesta
    // esplicita dell'utente ("Verbale di Conformità", art. 7 GDPR): prima
    // nessun atto tracciato confermava che l'utente avesse letto le
    // informative né dichiarato la maggiore età.
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role,
        legalConsentAt: new Date(),
        legalConsentVersion: LEGAL_CONSENT_VERSION,
        // Categorie scelte in registrazione (docs/CHANGELOG.md §217), da 1 a
        // 3 per un professionista: già controllate da `registerSchema`.
        signupCategorySlugs: role === "PROFESSIONAL" ? [...new Set(categorySlugs)] : [],
        // Privato, P.IVA o azienda (docs/CHANGELOG.md §243): già controllato da `registerSchema`.
        signupEntityType: role === "PROFESSIONAL" ? (entityType ?? null) : null,
      },
    });
    // Benvenuto (docs/CHANGELOG.md §185). Al professionista contiene anche
    // il link di conferma email (§178), al cliente no: non deve confermare nulla.
    if (role === "PROFESSIONAL") {
      await this.sendVerificationEmail(user.id, email, name ?? null, "welcome");
    } else {
      await this.emailService.send({ to: email, ...welcomeClientEmail(name ?? null) });
    }
    await this.checkLoginDevice(user, device);

    return { token: this.issueToken(user), isNewUser: true };
  }

  async login(email: string, password: string, device?: LoginDeviceInfo): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user?.passwordHash) {
      throw new UnauthorizedException("Email o password non corretti.");
    }
    // In pausa anche con la password giusta: altrimenti chi prova a indovinarla
    // capirebbe dalla risposta quando l'ha trovata.
    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      throw new HttpException(loginLockedMessage(user.loginLockedUntil), HttpStatus.TOO_MANY_REQUESTS);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await this.recordFailedLogin(user);
      throw new UnauthorizedException("Email o password non corretti.");
    }
    if (user.failedLoginCount > 0 || user.loginLockedUntil) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, loginLockedUntil: null } });
    }
    if (user.suspendedAt) {
      throw new ForbiddenException(SUSPENDED_ACCOUNT_MESSAGE);
    }

    await this.touchProfessionalActivity(user.id, user.role);
    await this.checkLoginDevice(user, device);
    return { token: this.issueToken(user), isNewUser: false };
  }

  /**
   * Limite di password sbagliate sul singolo account (docs/CHANGELOG.md
   * §289, OWASP ASVS 6.3.1): il limite per IP del controller non ferma chi
   * prova da tanti indirizzi. Alla LOGIN_MAX_FAILURES-esima di fila
   * l'accesso con password si ferma per LOGIN_LOCK_MINUTES minuti e il
   * titolare riceve un'email; Google e il recupero password restano aperti.
   */
  private async recordFailedLogin(user: { id: string; email: string | null; name: string | null }): Promise<void> {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount < LOGIN_MAX_FAILURES) return;
    const lockedUntil = new Date(Date.now() + LOGIN_LOCK_MINUTES * 60 * 1000);
    // Una sola richiesta chiude la pausa e manda l'email, anche con tentativi in parallelo.
    const locked = await this.prisma.user.updateMany({
      where: { id: user.id, failedLoginCount: { gte: LOGIN_MAX_FAILURES } },
      data: { failedLoginCount: 0, loginLockedUntil: lockedUntil },
    });
    if (locked.count === 0) return;
    if (user.email) await this.emailService.send({ to: user.email, ...loginLockedEmail(user.name, LOGIN_LOCK_MINUTES) });
    throw new HttpException(loginLockedMessage(lockedUntil), HttpStatus.TOO_MANY_REQUESTS);
  }

  /**
   * Dispositivo nuovo (docs/CHANGELOG.md §289): si ricorda per ogni
   * professionista da quali browser entra; da uno mai visto arriva l'email
   * "Nuovo accesso" (a tutti i professionisti, decisione dell'utente). Il primo
   * dispositivo ricordato non fa partire nulla. Un errore qui non blocca mai
   * l'accesso.
   */
  private async checkLoginDevice(
    user: { id: string; role: string; email: string | null; name: string | null },
    device: LoginDeviceInfo | undefined,
  ): Promise<void> {
    const deviceHash = loginDeviceHash(device);
    if (!deviceHash || user.role !== "PROFESSIONAL") return;
    try {
      const now = new Date();
      const seen = await this.prisma.loginDevice.updateMany({ where: { userId: user.id, deviceHash }, data: { lastSeenAt: now } });
      if (seen.count > 0) return;
      const known = await this.prisma.loginDevice.count({ where: { userId: user.id } });
      const label = loginDeviceLabel(device?.userAgent);
      await this.prisma.loginDevice.create({ data: { userId: user.id, deviceHash, label } });
      if (known === 0 || !user.email) return;
      await this.emailService.send({ to: user.email, ...newDeviceLoginEmail(user.name, { label, at: now }) });
    } catch (error) {
      this.logger.warn(`Controllo del dispositivo non riuscito: ${error instanceof Error ? error.message : error}`);
    }
  }

  async verifyGoogleToken(
    idToken: string,
    role?: "CLIENT" | "PROFESSIONAL",
    createIfMissing = true,
    legalConsent?: { acceptedLegalTerms: boolean; declaredAdult: boolean },
    categorySlugs: string[] = [],
    entityType?: ProfessionalEntityTypeValue,
    device?: LoginDeviceInfo,
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
    // Email in minuscolo come nei moduli del sito (§330).
    const googleEmail = payload.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findFirst({
      where: { OR: [{ googleId: payload.sub }, { email: googleEmail }] },
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
    // Un nuovo professionista sceglie da 1 a 3 categorie anche con Google
    // (docs/CHANGELOG.md §217); il massimo è già nello schema Zod.
    if (!existingUser && role === "PROFESSIONAL" && !entityType) {
      throw new BadRequestException(NO_ENTITY_TYPE_MESSAGE);
    }
    if (!existingUser && role === "PROFESSIONAL" && categorySlugs.length === 0) {
      throw new BadRequestException(NO_CATEGORY_MESSAGE);
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
          email: googleEmail,
          ...googleNameFields(payload),
          imageUrl,
          role: role ?? "CLIENT",
          signupCategorySlugs: role === "PROFESSIONAL" ? [...new Set(categorySlugs)] : [],
          signupEntityType: role === "PROFESSIONAL" ? (entityType ?? null) : null,
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
    if (existingUser && existingUser.role !== "CLIENT" && !existingUser.emailVerifiedAt && existingUser.email === googleEmail) {
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: { emailVerifiedAt: new Date(), ...CLEARED_EMAIL_CHECKS, passwordHash: null },
      });
    }

    if (existingUser) {
      await this.touchProfessionalActivity(user.id, user.role);
    } else if (user.email) {
      // Benvenuto anche a chi si iscrive con Google (docs/CHANGELOG.md §185): email già verificata, nessun link.
      const name = user.name ? user.name.split(" ")[0]! : null;
      await this.emailService.send({ to: user.email, ...(user.role === "PROFESSIONAL" ? welcomeProfessionalEmail(name, null) : welcomeClientEmail(name)) });
    }
    await this.checkLoginDevice(user, device);
    return { token: this.issueToken(user), isNewUser: !existingUser };
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

    // Indirizzo predefinito vero e nel comune indicato, solo se cambia (docs/CHANGELOG.md §214).
    if (data.street?.trim() && data.city?.trim()) {
      const current = await this.prisma.user.findUnique({ where: { id: userId }, select: { street: true, houseNumber: true, city: true } });
      if (!current || current.street !== data.street || (current.houseNumber ?? undefined) !== data.houseNumber || current.city !== data.city) {
        await this.geocodingService?.assertAddressInCity({ street: data.street, houseNumber: data.houseNumber, postalCode: data.postalCode, city: data.city });
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
   * Conferma email (docs/CHANGELOG.md §178, §243): genera un nuovo link e un
   * nuovo codice di 6 cifre (quelli precedenti smettono di valere) e li manda
   * nella stessa email. Non blocca mai il chiamante se l'email non parte:
   * l'utente può farla rispedire.
   */
  private async sendVerificationEmail(userId: string, email: string, name: string | null, mode: "welcome" | "verify"): Promise<void> {
    const token = randomBytes(32).toString("base64url");
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const now = Date.now();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        emailTokenHash: hashEmailToken(token),
        emailTokenExpiresAt: new Date(now + EMAIL_TOKEN_HOURS * 60 * 60 * 1000),
        emailCodeHash: hashEmailCode(userId, code),
        emailCodeExpiresAt: new Date(now + EMAIL_CODE_MINUTES * 60 * 1000),
        emailCodeAttempts: 0,
        emailCodeSentAt: new Date(now),
      },
    });
    const verify = {
      link: `${frontendUrl()}/conferma-email?token=${encodeURIComponent(token)}`,
      hours: EMAIL_TOKEN_HOURS,
      code,
      codeMinutes: EMAIL_CODE_MINUTES,
    };
    await this.emailService.send({
      to: email,
      ...(mode === "welcome" ? welcomeProfessionalEmail(name, verify) : verifyEmailEmail(name, verify)),
    });
  }

  /** Nuovo codice e nuovo link, al massimo uno ogni EMAIL_CODE_RESEND_SECONDS secondi. */
  async resendVerificationEmail(userId: string): Promise<{ alreadyVerified: boolean }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email || user.deletedAt !== null) {
      throw new NotFoundException("Account non trovato.");
    }
    if (user.emailVerifiedAt) return { alreadyVerified: true };
    const wait = emailCodeResendWait(user.emailCodeSentAt);
    if (wait > 0) {
      throw new HttpException(`Ti abbiamo appena mandato un codice. Puoi chiederne un altro tra ${wait} secondi.`, HttpStatus.TOO_MANY_REQUESTS);
    }
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
      data: { emailVerifiedAt: new Date(), ...CLEARED_EMAIL_CHECKS },
    });
    return { email: user.email };
  }

  /**
   * Conferma con il codice di 6 cifre (docs/CHANGELOG.md §243), da account
   * già entrato: al massimo EMAIL_CODE_MAX_ATTEMPTS tentativi per codice,
   * contati prima del confronto (anche due richieste insieme non ne
   * guadagnano uno in più). Esauriti i tentativi o scaduto il codice, serve
   * un codice nuovo.
   */
  async verifyEmailCode(userId: string, code: string): Promise<{ email: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.email || user.deletedAt !== null) {
      throw new NotFoundException("Account non trovato.");
    }
    if (user.emailVerifiedAt) return { email: user.email };
    if (!user.emailCodeHash || !user.emailCodeExpiresAt || user.emailCodeExpiresAt < new Date()) {
      throw new BadRequestException("Il codice è scaduto. Chiedine uno nuovo: arriva in pochi secondi.");
    }
    const counted = await this.prisma.user.updateMany({
      where: { id: userId, emailCodeAttempts: { lt: EMAIL_CODE_MAX_ATTEMPTS } },
      data: { emailCodeAttempts: { increment: 1 } },
    });
    if (counted.count === 0) {
      throw new BadRequestException("Hai sbagliato il codice troppe volte. Chiedine uno nuovo.");
    }
    const expected = Buffer.from(user.emailCodeHash, "hex");
    const actual = Buffer.from(hashEmailCode(userId, code), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      const left = EMAIL_CODE_MAX_ATTEMPTS - (user.emailCodeAttempts + 1);
      throw new BadRequestException(
        left > 0
          ? `Codice non corretto. Controlla l'ultima email ricevuta: ${left === 1 ? "ti resta 1 tentativo" : `ti restano ${left} tentativi`}.`
          : "Codice non corretto. Hai finito i tentativi: chiedi un codice nuovo.",
      );
    }
    await this.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date(), ...CLEARED_EMAIL_CHECKS } });
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

    assertPasswordWithoutEmail(newPassword, user.email);
    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    // Gli altri dispositivi escono (§292); questo resta dentro col token nuovo.
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    if (user.email) await this.emailService.send({ to: user.email, ...passwordChangedEmail(user.name) });
    return { token: this.issueToken(updated) };
  }

  /** "Esci dagli altri dispositivi" (§294): come dopo un cambio password, questo resta dentro col token nuovo. */
  async logoutOtherDevices(userId: string): Promise<{ token: string }> {
    const updated = await this.prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
    return { token: this.issueToken(updated) };
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
    // Anche un codice da scrivere sul sito (§245): utile quando l'email si
    // legge sul telefono e la password si cambia dal computer.
    const code = randomInt(0, 1_000_000).toString().padStart(EMAIL_CODE_LENGTH, "0");
    const now = Date.now();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: hashEmailToken(token),
        passwordResetExpiresAt: new Date(now + PASSWORD_RESET_MINUTES * 60 * 1000),
        passwordResetCodeHash: hashEmailCode(user.id, code),
        passwordResetCodeExpiresAt: new Date(now + EMAIL_CODE_MINUTES * 60 * 1000),
        passwordResetCodeAttempts: 0,
      },
    });
    const link = `${frontendUrl()}/reimposta-password?token=${encodeURIComponent(token)}`;
    await this.emailService.send({
      to: user.email,
      ...passwordResetEmail(user.name, { link, minutes: PASSWORD_RESET_MINUTES, code, codeMinutes: EMAIL_CODE_MINUTES }),
    });
  }

  /**
   * Codice di 6 cifre del recupero password (§245): se è giusto annulla il
   * codice e il link dell'email e restituisce un link nuovo, con cui il sito
   * apre la scelta della nuova password. Senza account, per indirizzi
   * sconosciuti la risposta d'errore è la stessa di un codice sbagliato.
   * Tentativi contati prima del confronto, come per la conferma email.
   */
  async exchangePasswordResetCode(email: string, code: string): Promise<{ token: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (
      !user?.email ||
      user.deletedAt !== null ||
      !user.passwordResetCodeHash ||
      !user.passwordResetCodeExpiresAt ||
      user.passwordResetCodeExpiresAt < new Date()
    ) {
      throw new BadRequestException(PASSWORD_RESET_CODE_ERROR);
    }
    const counted = await this.prisma.user.updateMany({
      where: { id: user.id, passwordResetCodeAttempts: { lt: EMAIL_CODE_MAX_ATTEMPTS } },
      data: { passwordResetCodeAttempts: { increment: 1 } },
    });
    const expected = Buffer.from(user.passwordResetCodeHash, "hex");
    const actual = Buffer.from(hashEmailCode(user.id, code), "hex");
    if (counted.count === 0 || expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new BadRequestException(PASSWORD_RESET_CODE_ERROR);
    }
    const token = randomBytes(32).toString("base64url");
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: hashEmailToken(token),
        passwordResetExpiresAt: new Date(Date.now() + PASSWORD_RESET_MINUTES * 60 * 1000),
        passwordResetCodeHash: null,
        passwordResetCodeExpiresAt: null,
        passwordResetCodeAttempts: 0,
      },
    });
    return { token };
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
    assertPasswordWithoutEmail(password, user.email);
    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    // Password nuova: si chiudono gli accessi aperti sugli altri dispositivi (§292).
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        passwordResetCodeHash: null,
        passwordResetCodeExpiresAt: null,
        passwordResetCodeAttempts: 0,
        // Password nuova: la pausa per i tentativi sbagliati non serve più.
        failedLoginCount: 0,
        loginLockedUntil: null,
        emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
        ...CLEARED_EMAIL_CHECKS,
      },
    });
    await this.emailService.send({ to: user.email, ...passwordChangedEmail(user.name) });
    if (user.suspendedAt) {
      throw new ForbiddenException(SUSPENDED_ACCOUNT_MESSAGE);
    }
    return { token: this.issueToken(updated), isNewUser: false };
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
  /**
   * Chi deve sapere che un professionista ha chiuso l'account: BookingsService
   * si registra qui (importa già AuthModule, il contrario sarebbe circolare).
   */
  private readonly professionalClosedHandlers: ((professionalProfileId: string, userId: string) => Promise<void>)[] = [];
  onProfessionalAccountClosed(handler: (professionalProfileId: string, userId: string) => Promise<void>): void {
    this.professionalClosedHandlers.push(handler);
  }

  async deleteAccount(userId: string): Promise<void> {
    const before = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    const professionalProfile = await this.prisma.professionalProfile.findUnique({ where: { userId } });
    if (professionalProfile) {
      await this.prisma.professionalProfile.update({ where: { id: professionalProfile.id }, data: { deletedAt: new Date() } });
      // I lavori futuri si annullano da soli e i clienti lo sanno subito (docs/CHANGELOG.md §348).
      for (const handler of this.professionalClosedHandlers) {
        await handler(professionalProfile.id, userId).catch((err: unknown) =>
          this.logger.error(`Lavori del professionista ${professionalProfile.id} non annullati: ${(err as Error).message}`),
        );
      }
    }

    // Dispositivi usati per l'accesso (§289): non servono più a nulla.
    await this.prisma.loginDevice.deleteMany({ where: { userId } });
    // Dati per la fattura chiesti ai professionisti (docs/CHANGELOG.md §372):
    // il professionista li ha già ricevuti, qui non servono più.
    await this.prisma.clientInvoiceRequest.deleteMany({ where: { clientId: userId } });
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
        emailCodeHash: null,
        name: null,
        surname: null,
        birthDate: null,
        imageUrl: null,
        passwordResetTokenHash: null,
        passwordResetCodeHash: null,
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

    const [guidedRequests, bookingsAsClient, reviewsWritten, savedProfessionals, professionalProfile] =
      await Promise.all([
        this.prisma.guidedRequest.findMany({
          where: { clientId: userId },
          include: { quotes: { include: { items: true, invoiceRequest: true } } },
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
        this.prisma.savedProfessional.findMany({ where: { userId } }),
        this.prisma.professionalProfile.findUnique({ where: { userId } }),
      ]);

    let professional: Record<string, unknown> | null = null;
    if (professionalProfile) {
      const [services, availabilitySlots, leads, quotesSent, bookingsAsProfessional, reviewsReceived, externalJobs] =
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
          this.prisma.externalJob.findMany({ where: { professionalProfileId: professionalProfile.id }, orderBy: { scheduledAt: "desc" } }),
        ]);
      professional = { profile: professionalProfile, services, availabilitySlots, leads, quotesSent, bookingsAsProfessional, reviewsReceived, externalJobs };
    }

    return {
      exportedAt: new Date().toISOString(),
      account,
      guidedRequests,
      bookingsAsClient,
      reviewsWritten,
      savedProfessionals,
      professional,
    };
  }

  private issueToken(user: { id: string; sessionVersion: number; role: string }): string {
    return this.jwt.sign(sessionTokenPayload(user), { expiresIn: sessionExpiresIn(user.role) });
  }
}
