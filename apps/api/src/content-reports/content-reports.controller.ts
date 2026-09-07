import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { createContentReportSchema, type CreateContentReportInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ContentReportsService } from "./content-reports.service";

/**
 * Meccanismo di segnalazione contenuti (richiesta esplicita dell'utente,
 * "Verbale di Conformità" — Reg. (UE) 2022/2065, art. 16): un profilo
 * pubblico, una recensione o una recensione sul cliente possono essere
 * segnalati come illeciti/inappropriati da chiunque abbia un account —
 * richiede l'autenticazione (stessa scelta pragmatica già seguita per ogni
 * altro endpoint del prodotto, a differenza dell'idea ideale del DSA di un
 * canale aperto anche ai non autenticati, fuori scope per questo giro).
 */
@UseGuards(JwtAuthGuard)
@Controller("reports")
export class ContentReportsController {
  constructor(private readonly contentReportsService: ContentReportsService) {}

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post()
  create(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(createContentReportSchema)) body: CreateContentReportInput) {
    return this.contentReportsService.create(req.user.userId, body);
  }
}
