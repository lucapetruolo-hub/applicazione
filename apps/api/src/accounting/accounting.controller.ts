import { Body, Controller, Get, Param, ParseIntPipe, Put, Req, UseGuards } from "@nestjs/common";
import { accountantSettingsSchema, courtesyDetailsSchema, courtesyYearCsv, type AccountantSettingsInput, type CourtesyDetailsInput, type DocumentsOverview } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { InvoicesService } from "./invoices.service";
import { StatementsService } from "./statements.service";
import { CourtesyCopyService } from "./courtesy-copy.service";
import { JobDocumentsService } from "./job-documents.service";
import { pdfResponse, renderDocumentPdf } from "./document-pdf";
import { courtesyPdfBaseName, courtesyPdfModel, courtesyYearPdfModel, invoicePdfModel, pdfFileName } from "./document-pdf-models";

/** Pagina "Fatture e documenti" del professionista (docs/CHANGELOG.md §378). */
@Controller("documents")
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly statementsService: StatementsService,
    private readonly courtesyCopyService: CourtesyCopyService,
    private readonly jobDocumentsService: JobDocumentsService,
  ) {}

  /** I documenti di un lavoro, dal menu della richiesta: del professionista o del cliente (§386). */
  @Get("jobs/:bookingId")
  jobDocuments(@Req() req: AuthenticatedRequest, @Param("bookingId") bookingId: string) {
    return this.jobDocumentsService.forUser(req.user.userId, bookingId);
  }

  /** La copia del documento del professionista, per il cliente (§386). */
  @Get("jobs/:bookingId/copy/pdf")
  async jobCopyPdf(@Req() req: AuthenticatedRequest, @Param("bookingId") bookingId: string) {
    const copy = await this.courtesyCopyService.forClient(req.user.userId, bookingId);
    return pdfResponse(await renderDocumentPdf(courtesyPdfModel(copy, "client")), pdfFileName(`copia-${courtesyPdfBaseName(copy)}`));
  }

  @Get()
  async overview(@Req() req: AuthenticatedRequest): Promise<DocumentsOverview> {
    const [overview, clientDocuments, receipts] = await Promise.all([
      this.invoicesService.overview(req.user.userId),
      this.courtesyCopyService.listForProfessional(req.user.userId),
      this.courtesyCopyService.makesReceipts(req.user.userId),
    ]);
    const missingDocuments = receipts ? await this.courtesyCopyService.missingForProfessional(req.user.userId) : [];
    return { ...overview, clientDocuments, missingDocuments, receipts };
  }

  @Get("invoices/:id")
  invoice(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.invoicesService.invoiceForProfessional(req.user.userId, id);
  }

  /** La fattura elettronica (XML), da dare al commercialista. */
  @Get("invoices/:id/xml")
  invoiceXml(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.invoicesService.xmlForProfessional(req.user.userId, id);
  }

  @Get("invoices/:id/pdf")
  async invoicePdf(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const invoice = await this.invoicesService.invoiceForProfessional(req.user.userId, id);
    return pdfResponse(await renderDocumentPdf(invoicePdfModel(invoice)), pdfFileName(`${invoice.creditNote ? "nota-di-credito" : "fattura"}-${invoice.number}`));
  }

  @Get("statements/:month")
  statement(@Req() req: AuthenticatedRequest, @Param("month") month: string) {
    return this.statementsService.statementFor(req.user.userId, month);
  }

  @Get("statements/:month/csv")
  statementCsv(@Req() req: AuthenticatedRequest, @Param("month") month: string) {
    return this.statementsService.csvFor(req.user.userId, month);
  }

  @Get("statements/:month/pdf")
  async statementPdf(@Req() req: AuthenticatedRequest, @Param("month") month: string) {
    const { fileName, pdf } = await this.statementsService.pdfFor(req.user.userId, month);
    return pdfResponse(pdf, fileName);
  }

  @Put("accountant")
  accountant(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(accountantSettingsSchema)) body: AccountantSettingsInput) {
    return this.statementsService.updateAccountant(req.user.userId, body);
  }

  /** Riepilogo dell'anno dei documenti dati ai clienti, per il commercialista (docs/CHANGELOG.md §382). */
  @Get("client-documents/:year/pdf")
  async clientDocumentsYearPdf(@Req() req: AuthenticatedRequest, @Param("year", ParseIntPipe) year: number) {
    const summary = await this.courtesyCopyService.yearSummaryForProfessional(req.user.userId, year);
    return pdfResponse(await renderDocumentPdf(courtesyYearPdfModel(summary)), `documenti-clienti-${year}.pdf`);
  }

  @Get("client-documents/:year/csv")
  async clientDocumentsYearCsv(@Req() req: AuthenticatedRequest, @Param("year", ParseIntPipe) year: number): Promise<{ fileName: string; csv: string }> {
    const summary = await this.courtesyCopyService.yearSummaryForProfessional(req.user.userId, year);
    return { fileName: `documenti-clienti-${year}.csv`, csv: courtesyYearCsv(summary) };
  }

  /** Copia di cortesia del documento del lavoro, da dare al cliente (mai mandata all'Agenzia). */
  @Get("courtesy/:bookingId")
  courtesy(@Req() req: AuthenticatedRequest, @Param("bookingId") bookingId: string) {
    return this.courtesyCopyService.forProfessional(req.user.userId, bookingId);
  }

  /** Numero e data della sua fattura, aliquota, nome e codice fiscale del cliente, ritenuta (collaudo del 29/10/2026). */
  @Put("courtesy/:bookingId/details")
  courtesyDetails(@Req() req: AuthenticatedRequest, @Param("bookingId") bookingId: string, @Body(new ZodValidationPipe(courtesyDetailsSchema)) body: CourtesyDetailsInput) {
    return this.courtesyCopyService.saveDetails(req.user.userId, bookingId, body);
  }

  @Get("courtesy/:bookingId/pdf")
  async courtesyPdf(@Req() req: AuthenticatedRequest, @Param("bookingId") bookingId: string) {
    const copy = await this.courtesyCopyService.forProfessionalPdf(req.user.userId, bookingId);
    return pdfResponse(await renderDocumentPdf(courtesyPdfModel(copy)), pdfFileName(courtesyPdfBaseName(copy)));
  }
}
