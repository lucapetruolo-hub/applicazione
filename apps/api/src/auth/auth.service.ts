import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";

const BCRYPT_SALT_ROUNDS = 10;

export type AuthResult = { token: string; isNewUser: boolean };

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client | null;

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly jwt: JwtService,
  ) {
    this.googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;
  }

  async register(email: string, password: string, name?: string, role: "CLIENT" | "PROFESSIONAL" = "CLIENT"): Promise<AuthResult> {
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new ConflictException("Esiste già un account con questa email.");
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = await this.prisma.user.create({ data: { email, passwordHash, name, role } });

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

    return { token: this.issueToken(user.id), isNewUser: false };
  }

  async verifyGoogleToken(idToken: string): Promise<AuthResult> {
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

    const user =
      existingUser ??
      (await this.prisma.user.create({
        data: { googleId: payload.sub, email: payload.email, name: payload.name },
      }));

    if (existingUser && !existingUser.googleId) {
      await this.prisma.user.update({ where: { id: existingUser.id }, data: { googleId: payload.sub } });
    }

    return { token: this.issueToken(user.id), isNewUser: !existingUser };
  }

  async updateAccount(userId: string, data: { name?: string; surname?: string; birthDate?: string; email?: string; phone?: string }) {
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

  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.user.delete({ where: { id: userId } });
  }

  private issueToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }
}
