import { BadRequestException, Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import { adminCourtesyDocumentKinds } from "@professionisti/shared";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { CourtesyCopyService } from "./courtesy-copy.service";
import { pdfResponse, renderDocumentPdf } from "./document-pdf";
import { courtesyPdfBaseName, courtesyPdfModel, pdfFileName } from "./document-pdf-models";

/**
 * Admin → Documenti ai clienti (docs/CHANGELOG.md §376): ricevute e copie di
 * cortesia preparate dai professionisti, per l'assistenza e le segnalazioni
 * sul lavoro. Come "Problemi segnalati", la vede ogni admin; ogni PDF aperto
 * resta nel registro azioni, come le chat (ci sono i dati del cliente).
 */
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdminScope("ANY")
@Controller("admin/courtesy-documents")
export class AdminCourtesyDocumentsController {
  constructor(private readonly courtesyCopyService: CourtesyCopyService) {}

  @Get()
  list(@Query("q") q?: string, @Query("kind") kind?: string, @Query("year") year?: string, @Query("bookingId") bookingId?: string) {
    const parsedKind = adminCourtesyDocumentKinds.find((value) => value === kind);
    if (kind && !parsedKind) throw new BadRequestException("Tipo di documento non valido.");
    const parsedYear = year ? Number(year) : undefined;
    if (parsedYear !== undefined && (!Number.isInteger(parsedYear) || parsedYear < 2000 || parsedYear > 2100)) throw new BadRequestException("Anno non valido.");
    return this.courtesyCopyService.adminList({ q: q?.slice(0, 100), kind: parsedKind, year: parsedYear, bookingId: bookingId || undefined });
  }

  @Get(":bookingId/pdf")
  async pdf(@Req() req: AuthenticatedRequest, @Param("bookingId") bookingId: string) {
    const copy = await this.courtesyCopyService.forAdmin(bookingId, req.user.userId);
    return pdfResponse(await renderDocumentPdf(courtesyPdfModel(copy)), pdfFileName(courtesyPdfBaseName(copy)));
  }
}
