import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { SiteStatsService } from "./site-stats.service";
import { AdminQueueService } from "./admin-queue.service";
import { AccountClosuresService } from "./account-closures.service";
import { SuspiciousAccountsService } from "./suspicious-accounts.service";
import { DatabaseVersionService } from "./database-version.service";
import { SiteHealthService } from "./site-health.service";
import { CaseAdviceService } from "./case-advice.service";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { JobIssuesModule } from "../job-issues/job-issues.module";
import { AdminController } from "./admin.controller";
import { AdminBootstrapController } from "./admin-bootstrap.controller";
import { AdminService } from "./admin.service";
import { InvitePartnersService } from "./invite-partners.service";
import { AdminGuard } from "./admin.guard";
import { EmailModule } from "../email/email.module";
import { AdminTwoFactorController } from "./admin-two-factor.controller";
import { AdminTwoFactorService } from "./admin-two-factor.service";
import { AdminSecurityAlertsService } from "./admin-security-alerts.service";

@Module({
  // NotificationsModule: AdminService.resolveContentReport notifica ora sia
  // il segnalante che l'autore del contenuto quando una segnalazione viene
  // accolta (DSA artt. 16/17, "statement of reasons") — senza questo
  // import esplicito Nest non risolve la dipendenza NotificationsService
  // iniettata in AdminService (stesso pattern già in uso per QuotesModule/
  // GuidedRequestsModule/BookingsModule verso lo stesso servizio).
  imports: [AuthModule, EmailModule, NotificationsModule, ProfessionalMetricsModule, AuditLogModule, JobIssuesModule],
  controllers: [AdminController, AdminBootstrapController, AdminTwoFactorController],
  providers: [InvitePartnersService, AdminService, AdminGuard, AdminTwoFactorService, AdminSecurityAlertsService, SiteStatsService, AdminQueueService, SuspiciousAccountsService, DatabaseVersionService, AccountClosuresService, SiteHealthService, CaseAdviceService],
  // AdminGuard esportata: i nuovi controller finanza/fiscale/DAC7 (CLAUDE.md
  // §88) vivono nei propri moduli ma restano protetti dallo stesso gate
  // amministratori — stessa istanza/dipendenze (PRISMA, globale) di quella
  // già in uso su AdminController.
  // AdminService: le proposte da approvare eliminano gli account di prova con lo stesso servizio del pulsante.
  exports: [AdminGuard, AdminService],
})
export class AdminModule {}
