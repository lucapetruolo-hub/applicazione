import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { CourtesyCopyService } from "./courtesy-copy.service";
import { pdfResponse, renderDocumentPdf } from "./document-pdf";
import { courtesyPdfBaseName, courtesyPdfModel, pdfFileName } from "./document-pdf-models";

/**
 * Admin → Documenti ai clienti (docs/CHANGELOG.md §380): ricevute per
 * prestazione occasionale preparate dai professionisti, per l'assistenza e le segnalazioni
 * sul lavoro. Come "Problemi segnalati", la vede ogni admin; ogni PDF aperto
 * resta nel registro azioni, come le chat (ci sono i dati del cliente).
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdminScope("ANY")
@Controller("admin/courtesy-documents")
export class AdminCourtesyDocumentsController {
  constructor(private readonly courtesyCopyService: CourtesyCopyService) {}

  @Get()
  list(@Query("q") rawQ?: unknown, @Query("year") rawYear?: unknown, @Query("bookingId") rawBookingId?: unknown) {
    const [q, year, bookingId] = [rawQ, rawYear, rawBookingId].map(single);
    const parsedYear = year ? Number(year) : undefined;
    if (parsedYear !== undefined && (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100)) throw new BadRequestException("Anno non valido.");
    return this.courtesyCopyService.adminList({ q: q?.slice(0, 100), year: parsedYear, bookingId: bookingId || undefined });
  }

  @Get(":bookingId/pdf")
  async pdf(@Req() req: AuthenticatedRequest, @Param("bookingId") bookingId: string) {
    const copy = await this.courtesyCopyService.forAdmin(bookingId, req.user.userId);
    return pdfResponse(await renderDocumentPdf(courtesyPdfModel(copy)), pdfFileName(courtesyPdfBaseName(copy)));
  }
}

/** Un parametro dell'indirizzo scritto una volta sola: `?q=a&q=b` arriva come elenco e non vale. */
function single(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string") return value;
  throw new BadRequestException("Parametro non valido.");
}
