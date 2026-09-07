import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ContentReportsController } from "./content-reports.controller";
import { ContentReportsService } from "./content-reports.service";

// Importa AuthModule (che esporta JwtService) — JwtAuthGuard ne dipende,
// stesso motivo già documentato altrove nel progetto per ogni modulo con un
// guard: senza questo import il bootstrap di Nest va in crash-loop.
@Module({
  imports: [AuthModule],
  controllers: [ContentReportsController],
  providers: [ContentReportsService],
})
export class ContentReportsModule {}
