import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OnlineMoneyService } from "./online-money.service";

/** Soldi dei pagamenti online (§168): usato da pagamenti, prenotazioni e segnalazioni, senza dipendenze circolari. */
@Module({
  imports: [AuditLogModule, NotificationsModule],
  providers: [OnlineMoneyService],
  exports: [OnlineMoneyService],
})
export class OnlineMoneyModule {}
