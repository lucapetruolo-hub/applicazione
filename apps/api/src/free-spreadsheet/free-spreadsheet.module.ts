import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { FreeSpreadsheetController } from "./free-spreadsheet.controller";
import { FreeSpreadsheetService } from "./free-spreadsheet.service";

@Module({
  imports: [EmailModule],
  controllers: [FreeSpreadsheetController],
  providers: [FreeSpreadsheetService],
})
export class FreeSpreadsheetModule {}
