import { Inject, Injectable, Logger } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { ADMIN_ROLE_LABEL, normalizeAdminRoles, type AdminRoleValue } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { EmailService } from "../email/email.service";
import { adminSecurityAlertEmail } from "../email/templates/account-emails";

type Person = { name: string | null; surname: string | null; email: string | null };

/** "Marta Rossi (marta@esempio.it)", o solo l'email. */
export function personLabel(person: Person | null): string {
  if (!person) return "un account eliminato";
  const name = [person.name, person.surname].filter(Boolean).join(" ").trim();
  if (name && person.email) return `${name} (${person.email})`;
  return name || person.email || "un account senza nome";
}

/** Testo dell'avviso per un cambio di ruolo admin. */
export function roleChangeAlert(target: Person, actor: Person | null, roles: AdminRoleValue[]): { title: string; text: string } {
  const by = `L'ha deciso ${personLabel(actor)}`;
  if (roles.length === 0) return { title: "Amministratore tolto", text: `${personLabel(target)} non è più admin. ${by}` };
  const labels = normalizeAdminRoles(roles).map((role) => ADMIN_ROLE_LABEL[role]).join(" + ");
  return { title: "Ruolo di amministratore cambiato", text: `${personLabel(target)} ora è admin (${labels}). ${by}` };
}

/**
 * Avvisi per email a tutti i super admin (docs/CHANGELOG.md §356, scelta di
 * Luca): chi entra con un account admin rubato e si crea complici o azzera
 * una verifica viene visto subito dagli altri. Un invio fallito non blocca
 * mai l'azione (resta nei log).
 */
@Injectable()
export class AdminSecurityAlertsService {
  private readonly logger = new Logger(AdminSecurityAlertsService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly emailService: EmailService,
  ) {}

  private person(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { name: true, surname: true, email: true } });
  }

  async adminRolesChanged(actorId: string, targetId: string, roles: AdminRoleValue[]): Promise<void> {
    const [actor, target] = await Promise.all([this.person(actorId), this.person(targetId)]);
    if (!target) return;
    await this.send(roleChangeAlert(target, actor, roles));
  }

  /** `actorId` uguale a `targetId`: azzerata da sé con il codice via email. */
  async twoFactorReset(actorId: string, targetId: string): Promise<void> {
    const [actor, target] = await Promise.all([this.person(actorId), this.person(targetId)]);
    const text =
      actorId === targetId
        ? `${personLabel(target)} ha azzerato la propria verifica in due passaggi con il codice ricevuto per email`
        : `La verifica in due passaggi di ${personLabel(target)} è stata azzerata. L'ha deciso ${personLabel(actor)}`;
    await this.send({ title: "Verifica in due passaggi azzerata", text });
  }

  private async send(alert: { title: string; text: string }): Promise<void> {
    try {
      const supers = await this.prisma.user.findMany({
        where: { role: "ADMIN", deletedAt: null, email: { not: null }, OR: [{ adminRoles: { has: "SUPER" } }, { adminRoles: { isEmpty: true } }] },
        select: { name: true, email: true },
      });
      const at = new Date();
      for (const admin of supers) {
        if (admin.email) await this.emailService.send({ to: admin.email, ...adminSecurityAlertEmail(admin.name, { ...alert, at }) });
      }
    } catch (error) {
      this.logger.warn(`Avviso ai super admin non inviato: ${error instanceof Error ? error.message : error}`);
    }
  }
}
