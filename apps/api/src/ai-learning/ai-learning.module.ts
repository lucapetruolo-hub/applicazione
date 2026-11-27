import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { AuditLogModule } from "../audit-log/audit-log.module";
import { ProblemMatchModule } from "../problem-match/problem-match.module";
import { AiLearningController } from "./ai-learning.controller";
import { AiLearningService } from "./ai-learning.service";

/** Il sito impara (docs/changelog/2026-11-27-il-sito-impara.md). Nessun modulo importa questo. */
@Module({
  imports: [AuthModule, AdminModule, AuditLogModule, ProblemMatchModule],
  controllers: [AiLearningController],
  providers: [AiLearningService],
})
export class AiLearningModule {}
