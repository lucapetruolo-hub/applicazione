import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { PrismaClient } from "@professionisti/database";
import qrcode from "qrcode-generator";
import { PRISMA } from "../prisma/prisma.module";
import { EmailService } from "../email/email.service";
import { EMAIL_BRAND } from "../email/email-brand";
import { adminAccessEmail, adminCodeLockedEmail, adminResetCodeEmail } from "../email/templates/account-emails";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AdminSecurityAlertsService } from "./admin-security-alerts.service";
import { encryptFiscal, readFiscal } from "../common/fiscal-crypto";
import { sessionExpiresIn, sessionTokenPayload } from "../auth/jwt-auth.guard";
import { loginDeviceLabel } from "../auth/login-device";
import {
  groupedSecret,
  ADMIN_RESET_CODE_MINUTES,
  ADMIN_RESET_CODE_RESEND_SECONDS,
  hashResetCode,
  isAdminVerificationFresh,
  matchTotp,
  newResetCode,
  newTotpSecret,
  otpauthUrl,
} from "./admin-two-factor";

/** Codici sbagliati di fila prima della pausa: meno delle password (10), il codice ha solo 6 cifre. */
export const ADMIN_2FA_MAX_FAILURES = 5;
export const ADMIN_2FA_LOCK_MINUTES = 15;

type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  sessionVersion: number;
  failedLoginCount: number;
  loginLockedUntil: Date | null;
  adminTotpSecret: string | null;
  adminTotpEnabledAt: Date | null;
  adminTotpLastStep: number | null;
  adminResetCodeHash: string | null;
  adminResetCodeExpiresAt: Date | null;
  adminResetCodeSentAt: Date | null;
};

/**
 * Verifica in due passaggi dell'area admin (docs/CHANGELOG.md §351): la si
 * attiva la prima volta che si apre l'area admin, poi il codice dell'app
 * serve ogni ADMIN_2FA_VALID_HOURS ore. Riuscito il codice, il sito riceve
 * un token nuovo che lo ricorda (`amfa`) e l'admin un'email.
 */
@Injectable()
export class AdminTwoFactorService {
  private readonly logger = new Logger(AdminTwoFactorService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
    private readonly emailService: EmailService,
    private readonly auditLogService: AuditLogService,
    private readonly securityAlerts: AdminSecurityAlertsService,
  ) {}

  private async adminUser(userId: string): Promise<AdminUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        sessionVersion: true,
        failedLoginCount: true,
        loginLockedUntil: true,
        adminTotpSecret: true,
        adminTotpEnabledAt: true,
        adminTotpLastStep: true,
        adminResetCodeHash: true,
        adminResetCodeExpiresAt: true,
        adminResetCodeSentAt: true,
      },
    });
    if (user?.role !== "ADMIN") throw new ForbiddenException("Accesso riservato agli amministratori.");
    return user;
  }

  async status(userId: string, adminVerifiedAt: number | undefined) {
    const user = await this.adminUser(userId);
    return {
      enabled: Boolean(user.adminTotpEnabledAt),
      verified: isAdminVerificationFresh(adminVerifiedAt, user.adminTotpEnabledAt),
      email: maskEmail(user.email),
    };
  }

  /** Chiave nuova (non ancora attiva) con il suo codice QR. Si può ripetere finché non si conferma. */
  async setup(userId: string) {
    const user = await this.adminUser(userId);
    if (user.adminTotpEnabledAt) throw new ConflictException("La verifica in due passaggi è già attiva.");
    const secret = newTotpSecret();
    await this.prisma.user.update({ where: { id: user.id }, data: { adminTotpSecret: encryptFiscal(secret), adminTotpLastStep: null } });
    const url = otpauthUrl(secret, user.email ?? user.id, `${EMAIL_BRAND.name} admin`);
    return { secret: groupedSecret(secret), otpauthUrl: url, qrCode: qrDataUrl(url) };
  }

  /** Primo codice giusto: la verifica diventa attiva e l'area admin si apre. */
  async enable(userId: string, typed: string, userAgent: string | undefined) {
    const user = await this.adminUser(userId);
    if (user.adminTotpEnabledAt) throw new ConflictException("La verifica in due passaggi è già attiva.");
    this.assertNotLocked(user);
    const secret = readFiscal(user.adminTotpSecret);
    if (!secret) throw new BadRequestException("Ricomincia: apri di nuovo la pagina per avere un codice QR nuovo.");
    const step = matchTotp(secret, typed, null);
    if (step === null) return this.recordFailure(user);

    const now = new Date();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { adminTotpEnabledAt: now, adminTotpLastStep: step, failedLoginCount: 0, loginLockedUntil: null },
    });
    await this.auditLogService.record({ entityType: "User", entityId: user.id, fieldName: "adminTwoFactor", newValue: "ENABLED", changedByUserId: user.id });
    await this.notify(user, { label: loginDeviceLabel(userAgent), at: now, justEnabled: true });
    return { token: this.verifiedToken(user, now) };
  }

  /** Codice dell'app: token nuovo con l'area admin aperta. */
  async verify(userId: string, typed: string, userAgent: string | undefined) {
    const user = await this.adminUser(userId);
    if (!user.adminTotpEnabledAt) throw new BadRequestException("Prima attiva la verifica in due passaggi.");
    this.assertNotLocked(user);
    const now = new Date();

    const secret = readFiscal(user.adminTotpSecret);
    const step = secret ? matchTotp(secret, typed, user.adminTotpLastStep, now) : null;
    if (step !== null) {
      // Solo se nessun'altra richiesta ha usato lo stesso codice nel frattempo.
      const saved = await this.prisma.user.updateMany({
        where: { id: user.id, OR: [{ adminTotpLastStep: null }, { adminTotpLastStep: { lt: step } }] },
        data: { adminTotpLastStep: step, failedLoginCount: 0, loginLockedUntil: null },
      });
      if (saved.count === 0) return this.recordFailure(user);
      await this.notify(user, { label: loginDeviceLabel(userAgent), at: now });
      return { token: this.verifiedToken(user, now) };
    }

    return this.recordFailure(user);
  }

  /**
   * Telefono perso, primo passo: codice di 6 cifre all'email dell'account,
   * valido ADMIN_RESET_CODE_MINUTES minuti. Serve quindi password ed email:
   * chi ha rubato solo la password resta fuori.
   */
  async sendResetCode(userId: string) {
    const user = await this.adminUser(userId);
    if (!user.adminTotpEnabledAt) throw new BadRequestException("La verifica in due passaggi non è attiva.");
    if (!user.email) throw new BadRequestException("Questo account non ha un'email: chiedi a un altro super admin di azzerare la verifica.");
    this.assertNotLocked(user);
    const now = new Date();
    if (user.adminResetCodeSentAt && now.getTime() - user.adminResetCodeSentAt.getTime() < ADMIN_RESET_CODE_RESEND_SECONDS * 1000) {
      throw new HttpException("Ti abbiamo appena mandato un codice: aspetta un minuto prima di chiederne un altro.", HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = newResetCode();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        adminResetCodeHash: hashResetCode(user.id, code),
        adminResetCodeExpiresAt: new Date(now.getTime() + ADMIN_RESET_CODE_MINUTES * 60 * 1000),
        adminResetCodeSentAt: now,
      },
    });
    await this.emailService.send({ to: user.email, ...adminResetCodeEmail(user.name, code, ADMIN_RESET_CODE_MINUTES) });
    return { email: maskEmail(user.email) };
  }

  /**
   * Telefono perso, secondo passo: codice giusto, la verifica si azzera e il
   * sito mostra subito il collegamento della nuova app (stesso percorso della
   * prima volta). Le altre sessioni aperte di questo admin si chiudono.
   */
  async confirmResetCode(userId: string, typed: string, userAgent: string | undefined) {
    const user = await this.adminUser(userId);
    this.assertNotLocked(user);
    const now = new Date();
    const valid =
      user.adminResetCodeHash !== null &&
      user.adminResetCodeExpiresAt !== null &&
      user.adminResetCodeExpiresAt > now &&
      user.adminResetCodeHash === hashResetCode(user.id, typed);
    if (!valid) {
      if (user.adminResetCodeExpiresAt && user.adminResetCodeExpiresAt <= now) {
        throw new BadRequestException("Il codice è scaduto: chiedine uno nuovo.");
      }
      return this.recordFailure(user);
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        adminTotpSecret: null,
        adminTotpEnabledAt: null,
        adminTotpLastStep: null,
        adminResetCodeHash: null,
        adminResetCodeExpiresAt: null,
        failedLoginCount: 0,
        loginLockedUntil: null,
        sessionVersion: { increment: 1 },
      },
      select: { sessionVersion: true },
    });
    await this.auditLogService.record({ entityType: "User", entityId: user.id, fieldName: "adminTwoFactor", newValue: "RESET_BY_EMAIL", changedByUserId: user.id });
    await this.notify(user, { label: loginDeviceLabel(userAgent), at: now, resetByEmail: true });
    await this.securityAlerts.twoFactorReset(user.id, user.id);
    // Token nuovo per questo dispositivo: gli altri restano fuori.
    return { token: this.jwt.sign(sessionTokenPayload({ id: user.id, sessionVersion: updated.sessionVersion }), { expiresIn: sessionExpiresIn(user.role) }) };
  }

  /**
   * Telefono perso: un super admin azzera la verifica di un altro admin, che
   * alla prossima apertura dell'area admin la riattiva da capo. Le sessioni
   * aperte di quell'admin si chiudono.
   */
  async reset(adminUserId: string, targetUserId: string) {
    if (adminUserId === targetUserId) {
      throw new BadRequestException("Non puoi azzerare la tua verifica: chiedilo a un altro super admin.");
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true, deletedAt: true } });
    if (!target || target.deletedAt || target.role !== "ADMIN") throw new NotFoundException("Admin non trovato.");
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        adminTotpSecret: null,
        adminTotpEnabledAt: null,
        adminTotpLastStep: null,
        adminResetCodeHash: null,
        adminResetCodeExpiresAt: null,
        sessionVersion: { increment: 1 },
      },
    });
    await this.auditLogService.record({ entityType: "User", entityId: targetUserId, fieldName: "adminTwoFactor", newValue: "RESET", changedByUserId: adminUserId });
    await this.securityAlerts.twoFactorReset(adminUserId, targetUserId);
    return { ok: true };
  }

  private verifiedToken(user: AdminUser, at: Date): string {
    return this.jwt.sign({ ...sessionTokenPayload(user), amfa: Math.floor(at.getTime() / 1000) }, { expiresIn: sessionExpiresIn(user.role) });
  }

  private assertNotLocked(user: AdminUser): void {
    if (user.loginLockedUntil && user.loginLockedUntil > new Date()) {
      throw new HttpException(lockedMessage(user.loginLockedUntil), HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Codice sbagliato: dopo ADMIN_2FA_MAX_FAILURES di fila l'account si ferma (anche il login con password) e l'admin riceve un'email. */
  private async recordFailure(user: AdminUser): Promise<never> {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (failedLoginCount >= ADMIN_2FA_MAX_FAILURES) {
      const lockedUntil = new Date(Date.now() + ADMIN_2FA_LOCK_MINUTES * 60 * 1000);
      const locked = await this.prisma.user.updateMany({
        where: { id: user.id, failedLoginCount: { gte: ADMIN_2FA_MAX_FAILURES } },
        data: { failedLoginCount: 0, loginLockedUntil: lockedUntil },
      });
      if (locked.count > 0) {
        if (user.email) await this.emailService.send({ to: user.email, ...adminCodeLockedEmail(user.name, ADMIN_2FA_LOCK_MINUTES) });
        throw new HttpException(lockedMessage(lockedUntil), HttpStatus.TOO_MANY_REQUESTS);
      }
    }
    throw new BadRequestException("Codice non corretto. Controlla l'app e scrivi il codice che vedi adesso.");
  }

  private async notify(user: AdminUser, access: Parameters<typeof adminAccessEmail>[1]): Promise<void> {
    if (!user.email) return;
    try {
      await this.emailService.send({ to: user.email, ...adminAccessEmail(user.name, access) });
    } catch (error) {
      // L'email non deve mai impedire l'accesso: l'errore resta nei log (e in Sentry).
      this.logger.warn(`Email di accesso admin non inviata: ${error instanceof Error ? error.message : error}`);
    }
  }
}

/** "l***@gmail.com": abbastanza per riconoscere la propria casella. */
function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [name = "", domain = ""] = email.split("@");
  return `${name.slice(0, 1)}***@${domain}`;
}

function lockedMessage(lockedUntil: Date): string {
  const minutes = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  return `Troppi codici sbagliati. Per sicurezza riprova tra ${minutes === 1 ? "1 minuto" : `${minutes} minuti`}.`;
}

/** Codice QR come immagine SVG: il sito lo mostra con un semplice <img>. */
function qrDataUrl(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
