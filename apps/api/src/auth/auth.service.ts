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

  private issueToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }
}
