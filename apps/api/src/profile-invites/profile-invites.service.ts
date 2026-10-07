import { BadRequestException, ConflictException, GoneException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import * as bcrypt from "bcryptjs";
import type { PrismaClient } from "@professionisti/database";
import {
  LEGAL_CONSENT_VERSION,
  PROFILE_INVITE_DAYS,
  type AcceptProfileInviteInput,
  type OperatorProfileInviteInput,
  type PendingProfileInvite,
  type ProfileInviteLink,
  type ProfileInvitePreview,
} from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { ProfessionalsService } from "../professionals/professionals.service";
import { AuditLogService } from "../audit-log/audit-log.service";
import { EmailService } from "../email/email.service";
import type { AuthResult } from "../auth/auth.service";

const BCRYPT_SALT_ROUNDS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Il codice del link resta l'unica chiave dell'account finché il
 * professionista non sceglie la password: nel database c'è l'impronta per
 * verificarlo e una copia cifrata, leggibile solo dal server, per mostrare
 * di nuovo il link all'operatore (docs/CHANGELOG.md §172).
 */
function tokenKey(): Buffer {
  return createHash("sha256").update(`profile-invite:${process.env.JWT_SECRET ?? "dev-secret-change-me"}`).digest();
}

function encryptToken(token: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", tokenKey(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString("base64url")).join(".");
}

function decryptToken(value: string): string | null {
  try {
    const [iv, tag, data] = value.split(".").map((part) => Buffer.from(part, "base64url"));
    if (!iv || !tag || !data) return null;
    const decipher = createDecipheriv("aes-256-gcm", tokenKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    // Chiave cambiata (JWT_SECRET ruotato): si crea un link nuovo.
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Profili creati da un operatore al telefono (docs/CHANGELOG.md §170).
 * L'operatore crea account e profilo con i dati essenziali, il
 * professionista riceve un link per scegliere la password; il profilo resta
 * fuori dalla ricerca (`invitePendingAt`) finché non lo salva accettando la
 * dichiarazione da `/dashboard/profilo`.
 */
@Injectable()
export class ProfileInvitesService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly professionalsService: ProfessionalsService,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
    private readonly jwt: JwtService,
  ) {}

  private frontendUrl(): string {
    return process.env.FRONTEND_URL ?? "http://localhost:3000";
  }

  async createByOperator(operatorUserId: string, input: OperatorProfileInviteInput): Promise<ProfileInviteLink> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("Esiste già un account con questa email.");

    const user = await this.prisma.user.create({
      data: { email, role: "PROFESSIONAL", name: input.name, surname: input.surname, phone: input.phone || undefined },
    });
    try {
      await this.professionalsService.upsertMyProfile(
        user.id,
        {
          categorySlug: input.categorySlug,
          businessName: input.businessName,
          city: input.city,
          address: input.address || undefined,
          bio: input.bio || undefined,
          subTags: [],
          remoteAvailable: false,
          services: [],
          portfolioUrls: [],
          spokenLanguages: ["Italiano"],
          hasLiabilityInsurance: false,
        },
        { byOperator: true },
      );
    } catch (err) {
      // Profilo non valido (es. categoria): niente account a metà.
      await this.prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
      throw err;
    }
    await this.auditLogService.record({
      entityType: "User",
      entityId: user.id,
      fieldName: "profileInvite",
      newValue: { businessName: input.businessName, city: input.city, categorySlug: input.categorySlug },
      changedByUserId: operatorUserId,
      reason: "Profilo creato da un operatore al telefono.",
    });
    return this.issueLink(operatorUserId, user.id);
  }

  private async requirePending(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { professionalProfile: { select: { invitePendingAt: true } } } });
    if (!user?.professionalProfile?.invitePendingAt || user.passwordHash) {
      throw new NotFoundException("Nessun profilo in attesa di conferma per questo utente.");
    }
    return user;
  }

  /**
   * "Visualizza link": lo stesso link già mandato, se vale ancora; se è
   * scaduto (o creato prima che si salvasse la copia cifrata) se ne crea
   * uno nuovo, senza email, che sostituisce il precedente.
   */
  async viewLink(operatorUserId: string, userId: string): Promise<ProfileInviteLink> {
    const user = await this.requirePending(userId);
    const invite = await this.prisma.profileInvite.findFirst({
      where: { userId, usedAt: null, expiresAt: { gt: new Date() }, tokenCiphertext: { not: null } },
      orderBy: { createdAt: "desc" },
      include: { user: { include: { professionalProfile: { select: { businessName: true } } } } },
    });
    const token = invite?.tokenCiphertext ? decryptToken(invite.tokenCiphertext) : null;
    if (!invite || !token) return this.issueLink(operatorUserId, user.id, { sendEmail: false });
    return {
      userId,
      email: user.email ?? "",
      businessName: invite.user.professionalProfile?.businessName ?? "",
      inviteUrl: this.inviteUrl(token),
      expiresAt: invite.expiresAt.toISOString(),
      emailSent: false,
    };
  }

  /** "Elimina": solo un profilo mai confermato (nessuna password scelta), con account e link. */
  async deletePending(operatorUserId: string, userId: string): Promise<void> {
    const user = await this.requirePending(userId);
    await this.prisma.user.delete({ where: { id: user.id } });
    await this.auditLogService.record({
      entityType: "User",
      entityId: user.id,
      fieldName: "profileInvite",
      oldValue: { email: user.email },
      changedByUserId: operatorUserId,
      reason: "Profilo creato da un operatore eliminato prima della conferma.",
    });
  }

  private inviteUrl(token: string): string {
    return `${this.frontendUrl()}/completa-profilo?codice=${token}`;
  }

  private async issueLink(operatorUserId: string, userId: string, options: { sendEmail?: boolean } = {}): Promise<ProfileInviteLink> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { professionalProfile: { select: { businessName: true } } } });
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + PROFILE_INVITE_DAYS * DAY_MS);
    await this.prisma.profileInvite.updateMany({ where: { userId, usedAt: null }, data: { expiresAt: new Date() } });
    await this.prisma.profileInvite.create({
      data: { userId, tokenHash: hashToken(token), tokenCiphertext: encryptToken(token), createdByUserId: operatorUserId, expiresAt },
    });
    const inviteUrl = this.inviteUrl(token);
    const businessName = user.professionalProfile?.businessName ?? "";
    const emailSent = user.email && options.sendEmail !== false
      ? await this.emailService.send({
          to: user.email,
          subject: "Il tuo profilo su Manovia è pronto",
          html: `<p>Ciao${user.name ? ` ${escapeHtml(user.name)}` : ""},</p><p>abbiamo preparato il profilo di <strong>${escapeHtml(businessName)}</strong> come concordato al telefono. Apri il link, scegli la password e controlla i dati: il profilo comparirà nelle ricerche solo dopo che l'avrai salvato tu.</p><p><a href="${inviteUrl}">Completa il tuo profilo</a></p><p>Il link vale ${PROFILE_INVITE_DAYS} giorni.</p>`,
        })
      : false;
    return { userId, email: user.email ?? "", businessName, inviteUrl, expiresAt: expiresAt.toISOString(), emailSent };
  }

  async listPending(): Promise<PendingProfileInvite[]> {
    const profiles = await this.prisma.professionalProfile.findMany({
      where: { invitePendingAt: { not: null }, deletedAt: null },
      orderBy: { invitePendingAt: "desc" },
      include: {
        category: { select: { label: true } },
        user: { select: { id: true, email: true, name: true, surname: true, profileInvites: { orderBy: { createdAt: "desc" }, take: 1 } } },
      },
    });
    return profiles.map((profile) => ({
      userId: profile.user.id,
      email: profile.user.email ?? "",
      name: [profile.user.name, profile.user.surname].filter(Boolean).join(" ") || null,
      businessName: profile.businessName,
      city: profile.city,
      categoryLabel: profile.category.label,
      createdAt: profile.invitePendingAt!.toISOString(),
      lastLinkExpiresAt: profile.user.profileInvites[0]?.expiresAt.toISOString() ?? null,
    }));
  }

  private async findValidInvite(token: string) {
    const invite = await this.prisma.profileInvite.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: { include: { professionalProfile: { select: { businessName: true } } } } },
    });
    if (!invite || invite.user.deletedAt) throw new NotFoundException("Link non valido. Chiedi un nuovo link a chi ti ha contattato.");
    if (invite.usedAt || invite.user.passwordHash) throw new GoneException("Questo link è già stato usato: accedi con email e password.");
    if (invite.expiresAt.getTime() <= Date.now()) throw new GoneException("Questo link è scaduto. Chiedi un nuovo link a chi ti ha contattato.");
    return invite;
  }

  async preview(token: string): Promise<ProfileInvitePreview> {
    const invite = await this.findValidInvite(token);
    return { email: invite.user.email ?? "", name: invite.user.name, businessName: invite.user.professionalProfile?.businessName ?? "" };
  }

  /** Il professionista sceglie la password: entra subito, e conferma il profilo da /dashboard/profilo. */
  async accept(input: AcceptProfileInviteInput): Promise<AuthResult> {
    const invite = await this.findValidInvite(input.token);
    const claimed = await this.prisma.profileInvite.updateMany({ where: { id: invite.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 0) throw new BadRequestException("Questo link è già stato usato: accedi con email e password.");
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: invite.userId },
      // Profilo verificato al telefono da un operatore: nessun link di
      // conferma email in più (docs/CHANGELOG.md §178).
      data: { passwordHash, legalConsentAt: new Date(), legalConsentVersion: LEGAL_CONSENT_VERSION, emailVerifiedAt: new Date() },
    });
    return { token: this.jwt.sign({ sub: invite.userId }), isNewUser: true };
  }
}
