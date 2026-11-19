import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { BOARD_MAP_TIMINGS, boardAlertSchema, boardReplySchema, isBoardTrade, isProfessionalCategorySlug, PROVINCE_NAMES, type BoardAlertInput, type BoardReplyInput } from "@professionisti/shared";
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
  private readonly maps = new ShortCache<Awaited<ReturnType<RequestBoardService["map"]>>>(SUMMARY_CACHE_MS);
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

  /**
   * Mappa (analisi/bacheca-mappa-piano.md): punti per comune e schede
   * dell'area. I bordi si arrotondano a 0,1 gradi, così le visite della
   * stessa zona usano la stessa memoria breve.
   */
  @Get("map")
  map(
    @Query("mestiere") trade?: string,
    @Query("quando") timing?: string,
    @Query("nord") north?: string,
    @Query("sud") south?: string,
    @Query("est") east?: string,
    @Query("ovest") west?: string,
  ) {
    if (trade && !isBoardTrade(trade)) throw new BadRequestException("Mestiere non valido.");
    const when = timing ? (BOARD_MAP_TIMINGS as readonly string[]).find((value) => value === timing) : undefined;
    if (timing && !when) throw new BadRequestException("Tempi non validi.");
    const raw = [north, south, east, west];
    let bounds: { north: number; south: number; east: number; west: number } | null = null;
    if (raw.some((value) => value !== undefined)) {
      const [n, s, e, w] = raw.map((value) => Number(value));
      if (![n, s, e, w].every((value) => Number.isFinite(value)) || n! < s! || e! < w! || Math.abs(n!) > 90 || Math.abs(s!) > 90 || Math.abs(e!) > 180 || Math.abs(w!) > 180) {
        throw new BadRequestException("Area non valida.");
      }
      // Arrotondati verso l'esterno: l'area chiesta resta sempre dentro.
      bounds = { north: Math.ceil(n! * 10) / 10, south: Math.floor(s! * 10) / 10, east: Math.ceil(e! * 10) / 10, west: Math.floor(w! * 10) / 10 };
    }
    const key = `${trade ?? ""}|${when ?? ""}|${bounds ? `${bounds.north},${bounds.south},${bounds.east},${bounds.west}` : "italia"}`;
    return this.maps.get(key, () => this.board.map({ trade: trade && isBoardTrade(trade) ? trade : null, timing: (when as "TODAY" | "WEEK" | "CALM" | undefined) ?? null, bounds }));
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
