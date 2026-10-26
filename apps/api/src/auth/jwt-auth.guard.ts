import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { PrismaClient } from "@professionisti/database";
import type { Request } from "express";
import { PRISMA } from "../prisma/prisma.module";

/**
 * `adminVerifiedAt`: quando (secondi) è stato dato il codice della verifica in
 * due passaggi dell'area admin, se il token lo porta (docs/CHANGELOG.md §351).
 */
export type AuthenticatedRequest = Request & { user: { userId: string; adminVerifiedAt?: number } };

/**
 * Contenuto del token di accesso: l'utente e la versione delle sessioni di
 * quando è stato emesso (controllo sicurezza, docs/CHANGELOG.md §292). I token
 * emessi prima non hanno `sv` e valgono come versione 0.
 */
export type SessionTokenPayload = { sub: string; sv?: number; amfa?: number };

export function sessionTokenPayload(user: { id: string; sessionVersion: number }): SessionTokenPayload {
  return { sub: user.id, sv: user.sessionVersion };
}

/**
 * Durata del login: 30 giorni, 7 per gli admin (docs/CHANGELOG.md §351). Un
 * account admin rubato resta aperto meno a lungo; l'area admin chiede in più
 * il codice della verifica in due passaggi ogni ADMIN_2FA_VALID_HOURS ore.
 */
export function sessionExpiresIn(role: string): "7d" | "30d" {
  return role === "ADMIN" ? "7d" : "30d";
}

/** Il token è stato emesso prima dell'ultimo cambio o recupero della password. */
export function isRevokedSession(payload: SessionTokenPayload, sessionVersion: number): boolean {
  return (payload.sv ?? 0) !== sessionVersion;
}

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

    let payload: SessionTokenPayload;
    try {
      payload = this.jwt.verify<SessionTokenPayload>(token);
    } catch {
      throw new UnauthorizedException("Token non valido o scaduto.");
    }
    const userId = payload.sub;

    // Sospensione decisa da un admin (docs/CHANGELOG.md §144): letta dal
    // database a ogni richiesta, perché un token già emesso resta valido per
    // 30 giorni e una sospensione che vale solo al prossimo login non
    // sospenderebbe nulla. Stesso principio di AdminGuard (ruolo riletto).
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { suspendedAt: true, sessionVersion: true } });
    // Password cambiata o reimpostata dopo l'emissione: l'accesso è chiuso.
    if (user && isRevokedSession(payload, user.sessionVersion)) {
      throw new UnauthorizedException("Token non valido o scaduto.");
    }
    if (user?.suspendedAt) {
      throw new ForbiddenException(SUSPENDED_ACCOUNT_MESSAGE);
    }

    (request as AuthenticatedRequest).user = { userId, ...(typeof payload.amfa === "number" ? { adminVerifiedAt: payload.amfa } : {}) };
    return true;
  }
}
