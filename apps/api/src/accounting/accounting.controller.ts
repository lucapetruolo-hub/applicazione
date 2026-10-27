import { Body, Controller, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { accountantSettingsSchema, type AccountantSettingsInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { InvoicesService } from "./invoices.service";
import { StatementsService } from "./statements.service";
import { CourtesyCopyService } from "./courtesy-copy.service";

/** Pagina "Fatture e documenti" del professionista (docs/CHANGELOG.md §372). */
@Controller("documents")
@UseGuards(JwtAuthGuard)
export class AccountingController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly statementsService: StatementsService,
    private readonly courtesyCopyService: CourtesyCopyService,
  ) {}

  @Get()
  overview(@Req() req: AuthenticatedRequest) {
    return this.invoicesService.overview(req.user.userId);
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

  @Get("statements/:month")
  statement(@Req() req: AuthenticatedRequest, @Param("month") month: string) {
    return this.statementsService.statementFor(req.user.userId, month);
  }

  @Get("statements/:month/csv")
  statementCsv(@Req() req: AuthenticatedRequest, @Param("month") month: string) {
    return this.statementsService.csvFor(req.user.userId, month);
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
}
