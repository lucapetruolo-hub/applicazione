import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { AdminController } from "./admin.controller";
import { AdminBootstrapController } from "./admin-bootstrap.controller";
import { AdminService } from "./admin.service";
import { AdminGuard } from "./admin.guard";

@Module({
  // NotificationsModule: AdminService.resolveContentReport notifica ora sia
  // il segnalante che l'autore del contenuto quando una segnalazione viene
  // accolta (DSA artt. 16/17, "statement of reasons") — senza questo
  // import esplicito Nest non risolve la dipendenza NotificationsService
  // iniettata in AdminService (stesso pattern già in uso per QuotesModule/
  // GuidedRequestsModule/BookingsModule verso lo stesso servizio).
  imports: [AuthModule, NotificationsModule, ProfessionalMetricsModule],
  controllers: [AdminController, AdminBootstrapController],
  providers: [AdminService, AdminGuard],
  // AdminGuard esportata: i nuovi controller finanza/fiscale/DAC7 (CLAUDE.md
  // §88) vivono nei propri moduli ma restano protetti dallo stesso gate
  // amministratori — stessa istanza/dipendenze (PRISMA, globale) di quella
  // già in uso su AdminController.
  exports: [AdminGuard],
})
export class AdminModule {}
