import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { boardAlertSchema, boardReplySchema, isBoardTrade, isProfessionalCategorySlug, PROVINCE_NAMES, type BoardAlertInput, type BoardReplyInput } from "@professionisti/shared";
import { ShortCache, SUMMARY_CACHE_MS } from "../common/short-cache";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { assertTurnstile } from "../auth/turnstile";
import { clientIp } from "../common/client-ip";
import { RequestBoardService } from "./request-board.service";

/**
 * Bacheca "Lavori cercati" (docs/changelog/2026-11-17-bacheca-lavori-cercati.md
 * e 2026-11-17-bacheca-rispondi.md): schede anonime per tutti, 20 per pagina,
 * un minuto di memoria breve come gli altri riepiloghi; "Rispondi" solo per
 * i professionisti; "Avvisami" senza account.
 */
@Controller("request-board")
export class RequestBoardController {
  private readonly pages = new ShortCache<Awaited<ReturnType<RequestBoardService["list"]>>>(SUMMARY_CACHE_MS);
  private readonly summaries = new ShortCache<Awaited<ReturnType<RequestBoardService["summary"]>>>(SUMMARY_CACHE_MS);
  private readonly demands = new ShortCache<Awaited<ReturnType<RequestBoardService["demand"]>>>(SUMMARY_CACHE_MS);

  constructor(private readonly board: RequestBoardService) {}

  @Get()
  list(@Query("mestiere") trade?: string, @Query("provincia") province?: string, @Query("pagina") rawPage?: string) {
    if (!isBoardTrade(trade)) throw new BadRequestException("Mestiere non valido.");
    const code = province?.trim().toUpperCase() || null;
    if (code && !PROVINCE_NAMES[code]) throw new BadRequestException("Provincia non valida.");
    const page = Number(rawPage ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > 50) throw new BadRequestException("Pagina non valida.");
    return this.pages.get(`${trade}|${code ?? ""}|${page}`, () => this.board.list({ trade, province: code, page }));
  }

  @Get("summary")
  summary() {
    return this.summaries.get("tutte", () => this.board.summary());
  }

  /** Richieste del mese per mestiere e provincia, per le pagine /cerca: solo un numero, da 10 in su. */
  @Get("demand")
  demand(@Query("categoria") category?: string, @Query("provincia") province?: string) {
    const code = province?.trim().toUpperCase() ?? "";
    const slug = category?.trim() ?? "";
    if (!isProfessionalCategorySlug(slug) || !PROVINCE_NAMES[code]) throw new BadRequestException("Mestiere o provincia non validi.");
    return this.demands.get(`${slug}|${code}`, () => this.board.demand(slug, code));
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post("reply")
  @HttpCode(200)
  reply(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(boardReplySchema)) body: BoardReplyInput) {
    return this.board.reply(req.user.userId, body.requestId);
  }

  // Pubblico, nessun account (stesso limite dei contatti).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("alerts")
  @HttpCode(200)
  async alert(@Body(new ZodValidationPipe(boardAlertSchema)) body: BoardAlertInput, @Req() req: Request) {
    // Honeypot: un bot che compila ogni campo riceve lo stesso "fatto" senza scrivere nulla.
    if (body.website) return { ok: true as const };
    await assertTurnstile(body.turnstileToken, clientIp(req));
    return this.board.addAlert(body);
  }
}
