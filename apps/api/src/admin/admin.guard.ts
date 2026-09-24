import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PrismaClient } from "@professionisti/database";
import { adminCan, type AdminScope } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";

const ADMIN_SCOPE_KEY = "adminScope";

/**
 * Area del pannello a cui appartiene una rotta o un controller (docs/CHANGELOG.md
 * §145, ruoli admin separati). Senza decoratore la rotta è aperta a
 * qualunque admin.
 */
export const RequireAdminScope = (scope: AdminScope) => SetMetadata(ADMIN_SCOPE_KEY, scope);

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
    const user = await this.prisma.user.findUnique({ where: { id: request.user.userId }, select: { role: true, adminRoles: true } });
    if (user?.role !== "ADMIN") {
      throw new ForbiddenException("Accesso riservato agli amministratori.");
    }
    const scope = this.reflector.getAllAndOverride<AdminScope | undefined>(ADMIN_SCOPE_KEY, [context.getHandler(), context.getClass()]) ?? "ANY";
    if (!adminCan(user.adminRoles, scope)) {
      throw new ForbiddenException("Questa sezione non rientra nel tuo ruolo di amministratore.");
    }
    return true;
  }
}
