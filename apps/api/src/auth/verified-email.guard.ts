import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import type { AuthenticatedRequest } from "./jwt-auth.guard";

export const EMAIL_NOT_VERIFIED_MESSAGE =
  "Conferma prima il tuo indirizzo email: apri il link che ti abbiamo inviato (puoi farlo rispedire dalla barra in alto).";

/**
 * Conferma email obbligatoria (docs/CHANGELOG.md §174) solo con
 * `EMAIL_VERIFICATION_REQUIRED=true` su Render: senza un dominio verificato
 * su Resend le email arrivano solo al titolare dell'account Resend, e
 * nessun altro potrebbe confermare. Va sempre dopo `JwtAuthGuard`
 * (`@UseGuards(JwtAuthGuard, VerifiedEmailGuard)`), che imposta `req.user`.
 */
export function isEmailVerificationRequired(): boolean {
  return process.env.EMAIL_VERIFICATION_REQUIRED === "true";
}

@Injectable()
export class VerifiedEmailGuard implements CanActivate {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!isEmailVerificationRequired()) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.prisma.user.findUnique({ where: { id: request.user.userId }, select: { emailVerifiedAt: true } });
    if (!user?.emailVerifiedAt) {
      throw new ForbiddenException(EMAIL_NOT_VERIFIED_MESSAGE);
    }
    return true;
  }
}
