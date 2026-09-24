import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { PrismaClient } from "@professionisti/database";
import type { Request } from "express";
import { PRISMA } from "../prisma/prisma.module";

export type AuthenticatedRequest = Request & { user: { userId: string } };

/** Messaggio unico per un account sospeso, anche al login (AuthService). */
export const SUSPENDED_ACCOUNT_MESSAGE =
  "Il tuo account è stato sospeso dopo una segnalazione. Se ritieni sia un errore, scrivici dal modulo Contatti.";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException("Token mancante.");
    }

    let userId: string;
    try {
      userId = this.jwt.verify<{ sub: string }>(token).sub;
    } catch {
      throw new UnauthorizedException("Token non valido o scaduto.");
    }

    // Sospensione decisa da un admin (docs/CHANGELOG.md §144): letta dal
    // database a ogni richiesta, perché un token già emesso resta valido per
    // 30 giorni e una sospensione che vale solo al prossimo login non
    // sospenderebbe nulla. Stesso principio di AdminGuard (ruolo riletto).
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { suspendedAt: true } });
    if (user?.suspendedAt) {
      throw new ForbiddenException(SUSPENDED_ACCOUNT_MESSAGE);
    }

    (request as AuthenticatedRequest).user = { userId };
    return true;
  }
}
