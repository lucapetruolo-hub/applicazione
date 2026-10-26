import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient } from "@professionisti/database";
import { adminCan, type AdminScope } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { isAdminVerificationFresh } from "./admin-two-factor";

const ADMIN_SCOPE_KEY = "adminScope";

/**
 * Area del pannello a cui appartiene una rotta o un controller (docs/CHANGELOG.md
 * §145, ruoli admin separati). Senza decoratore la rotta è aperta a
 * qualunque admin.
 */
export const RequireAdminScope = (scope: AdminScope) => SetMetadata(ADMIN_SCOPE_KEY, scope);

/**
 * Codici che il sito legge per mostrare l'attivazione o la richiesta del
 * codice della verifica in due passaggi (docs/CHANGELOG.md §359).
 */
export const ADMIN_2FA_SETUP_CODE = "ADMIN_2FA_SETUP";
export const ADMIN_2FA_REQUIRED_CODE = "ADMIN_2FA_REQUIRED";

// Va sempre usato dopo JwtAuthGuard (si appoggia a request.user.userId, che
// solo JwtAuthGuard popola). Il ruolo non è nel JWT: va sempre riletto dal
// DB, altrimenti un token emesso prima di una promozione ad ADMIN (o dopo
// una retrocessione) resterebbe valido con i permessi vecchi fino a scadenza.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.prisma.user.findUnique({
      where: { id: request.user.userId },
      select: { role: true, adminRoles: true, adminTotpEnabledAt: true },
    });
    if (user?.role !== "ADMIN") {
      throw new ForbiddenException("Accesso riservato agli amministratori.");
    }
    // Verifica in due passaggi obbligatoria (docs/CHANGELOG.md §359): la
    // password da sola non apre più l'area admin. Il codice vale
    // ADMIN_2FA_VALID_HOURS ore, poi va ridato.
    if (!user.adminTotpEnabledAt) {
      throw new ForbiddenException({ message: "Attiva la verifica in due passaggi per entrare nell'area admin.", code: ADMIN_2FA_SETUP_CODE });
    }
    if (!isAdminVerificationFresh(request.user.adminVerifiedAt, user.adminTotpEnabledAt)) {
      throw new ForbiddenException({ message: "Inserisci il codice della verifica in due passaggi.", code: ADMIN_2FA_REQUIRED_CODE });
    }
    const scope = this.reflector.getAllAndOverride<AdminScope | undefined>(ADMIN_SCOPE_KEY, [context.getHandler(), context.getClass()]) ?? "ANY";
    if (!adminCan(user.adminRoles, scope)) {
      throw new ForbiddenException("Questa sezione non rientra nel tuo ruolo di amministratore.");
    }
    return true;
  }
}
