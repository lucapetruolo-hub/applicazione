import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { PRISMA } from "../prisma/prisma.module";
import type { AuthenticatedRequest } from "./jwt-auth.guard";

// Prima parlava del "codice" e di "Inserisci il codice": dal 28/10 la cosa da
// fare è il pulsante nell'email, il codice resta di riserva
// (docs/changelog/2026-10-28-verifica-email-con-link.md).
export const EMAIL_NOT_VERIFIED_MESSAGE = "Conferma prima la tua email: apri l'email che ti abbiamo mandato e premi il pulsante.";
/** Il sito riconosce il blocco e apre la conferma dove si trova (accettazione del preventivo). */
export const EMAIL_NOT_VERIFIED_CODE = "EMAIL_NOT_VERIFIED";

/**
 * Conferma email obbligatoria (docs/CHANGELOG.md §178) solo con
 * `EMAIL_VERIFICATION_REQUIRED=true` su Render: senza un dominio verificato
 * su Resend le email arrivano solo al titolare dell'account Resend, e
 * nessun altro potrebbe confermare. Vale per il professionista (profilo,
 * preventivi) e per il cliente quando accetta un preventivo, che fissa
 * l'appuntamento e consuma un lavoro del professionista
 * (docs/changelog/2026-11-05-verifica-email-cliente.md). Va sempre dopo `JwtAuthGuard`
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
      throw new ForbiddenException({ message: EMAIL_NOT_VERIFIED_MESSAGE, code: EMAIL_NOT_VERIFIED_CODE });
    }
    return true;
  }
}
