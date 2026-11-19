import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AccountingModule } from "../accounting/accounting.module";
import { CashbookController } from "./cashbook.controller";
import { CashbookService } from "./cashbook.service";

/** Entrate e uscite del professionista (docs/changelog/2026-11-19-entrate-e-uscite.md). */
@Module({
  imports: [AuthModule, AccountingModule],
  controllers: [CashbookController],
  providers: [CashbookService],
  exports: [CashbookService],
})
export class CashbookModule {}
