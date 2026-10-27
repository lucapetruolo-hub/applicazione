import { Body, Controller, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { accountantSettingsSchema, courtesyNumberSchema, type AccountantSettingsInput, type CourtesyNumberInput, type DocumentsOverview } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { InvoicesService } from "./invoices.service";
import { StatementsService } from "./statements.service";
import { CourtesyCopyService } from "./courtesy-copy.service";
import { pdfResponse, renderDocumentPdf } from "./document-pdf";
import { courtesyPdfBaseName, courtesyPdfModel, invoicePdfModel, pdfFileName } from "./document-pdf-models";

/** Pagina "Fatture e documenti" del professionista (docs/CHANGELOG.md §378). */
@Controller("documents")
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly statementsService: StatementsService,
    private readonly courtesyCopyService: CourtesyCopyService,
  ) {}

  @Get()
  async overview(@Req() req: AuthenticatedRequest): Promise<DocumentsOverview> {
    const [overview, clientDocuments] = await Promise.all([this.invoicesService.overview(req.user.userId), this.courtesyCopyService.listForProfessional(req.user.userId)]);
    return { ...overview, clientDocuments };
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

  /** Copia di cortesia del documento del lavoro, da dare al cliente (mai mandata all'Agenzia). */
  @Get("courtesy/:bookingId")
  courtesy(@Req() req: AuthenticatedRequest, @Param("bookingId") bookingId: string) {
    return this.courtesyCopyService.forProfessional(req.user.userId, bookingId);
  }

  /** Il numero della sua fattura, da riportare sulla copia (la ricevuta lo ha già da noi). */
  @Put("courtesy/:bookingId/number")
  courtesyNumber(@Req() req: AuthenticatedRequest, @Param("bookingId") bookingId: string, @Body(new ZodValidationPipe(courtesyNumberSchema)) body: CourtesyNumberInput) {
    return this.courtesyCopyService.setOwnNumber(req.user.userId, bookingId, body);
  }

  @Get("courtesy/:bookingId/pdf")
  async courtesyPdf(@Req() req: AuthenticatedRequest, @Param("bookingId") bookingId: string) {
    const copy = await this.courtesyCopyService.forProfessionalPdf(req.user.userId, bookingId);
    return pdfResponse(await renderDocumentPdf(courtesyPdfModel(copy)), pdfFileName(courtesyPdfBaseName(copy)));
  }
}
