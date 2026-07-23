import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import type { AuthenticatedRequest } from "../auth/jwt-auth.guard";

// Va sempre usato dopo JwtAuthGuard (si appoggia a request.user.userId, che
// solo JwtAuthGuard popola). Il ruolo non è nel JWT: va sempre riletto dal
// DB, altrimenti un token emesso prima di una promozione ad ADMIN (o dopo
// una retrocessione) resterebbe valido con i permessi vecchi fino a scadenza.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.prisma.user.findUnique({ where: { id: request.user.userId }, select: { role: true } });
    if (user?.role !== "ADMIN") {
      throw new ForbiddenException("Accesso riservato agli amministratori.");
    }
    return true;
  }
}
