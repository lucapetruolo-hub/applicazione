import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { AiLearningService } from "./ai-learning.service";

/**
 * Admin → Proposte dell'IA: banco di prova, regole approvate e misura mese
 * per mese (docs/changelog/2026-11-27-il-sito-impara.md). Leggere: ogni
 * admin; togliere casi e regole o rifare il banco (costa chiamate all'IA): super admin.
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/ai-learning")
export class AiLearningController {
  constructor(private readonly aiLearningService: AiLearningService) {}

  @RequireAdminScope("ANY")
  @Get()
  overview() {
    return this.aiLearningService.overview();
  }

  @RequireAdminScope("SUPER")
  @Delete("cases/:id")
  @HttpCode(204)
  async removeCase(@Req() req: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    await this.aiLearningService.removeCase(req.user.userId, id);
  }

  @RequireAdminScope("SUPER")
  @Delete("rules/:id")
  @HttpCode(204)
  async removeRule(@Req() req: AuthenticatedRequest, @Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    await this.aiLearningService.removeRule(req.user.userId, id);
  }

  @RequireAdminScope("SUPER")
  @Post("run")
  @HttpCode(200)
  run() {
    return this.aiLearningService.runNow();
  }
}
