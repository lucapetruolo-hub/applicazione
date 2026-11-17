import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import { isBoardTrade, PROVINCE_NAMES } from "@professionisti/shared";
import { ShortCache, SUMMARY_CACHE_MS } from "../common/short-cache";
import { RequestBoardService } from "./request-board.service";

/**
 * Bacheca "Lavori cercati", pubblica e senza account
 * (docs/changelog/2026-11-17-bacheca-lavori-cercati.md): solo schede anonime,
 * 20 per pagina, un minuto di memoria breve come gli altri riepiloghi.
 */
@Controller("request-board")
export class RequestBoardController {
  private readonly pages = new ShortCache<Awaited<ReturnType<RequestBoardService["list"]>>>(SUMMARY_CACHE_MS);
  private readonly summaries = new ShortCache<Awaited<ReturnType<RequestBoardService["summary"]>>>(SUMMARY_CACHE_MS);

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
}
