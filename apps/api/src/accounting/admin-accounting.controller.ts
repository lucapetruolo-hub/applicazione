import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from "@nestjs/common";
import { platformInvoiceSettingsSchema, type PlatformInvoiceSettingsInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { InvoicesService } from "./invoices.service";
import { FeeReconciliationService } from "./fee-reconciliation.service";

/** Admin → Finanza: dati della nostra società e le fatture emesse (docs/CHANGELOG.md §372). */
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdminScope("FINANCE")
@Controller("admin/invoices")
export class AdminAccountingController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly feeReconciliationService: FeeReconciliationService,
  ) {}

  @Get("settings")
  settings() {
    return this.invoicesService.settingsView();
  }

  @Put("settings")
  updateSettings(@Body(new ZodValidationPipe(platformInvoiceSettingsSchema)) body: PlatformInvoiceSettingsInput) {
    return this.invoicesService.updateSettings(body);
  }

  /** Quadratura del mese con Stripe. */
  @Get("reconciliation/:month")
  reconciliation(@Param("month") month: string) {
    return this.feeReconciliationService.reconcile(month);
  }

  /** Prova d'invio allo SdI nella prova di Openapi (docs/CHANGELOG.md §374). */
  @Post("sdi-test")
  sdiTest() {
    return this.invoicesService.adminSdiSandboxTest();
  }

  @Get()
  list(@Query("month") month?: string) {
    return this.invoicesService.adminList(month);
  }

  @Get(":id")
  view(@Param("id") id: string) {
    return this.invoicesService.adminView(id);
  }

  @Get(":id/xml")
  xml(@Param("id") id: string) {
    return this.invoicesService.adminXml(id);
  }

  /** Emette le fatture delle trattenute di un mese concluso, se il giro del 1° non è partito. */
  @Post("run/:month")
  runMonth(@Param("month") month: string) {
    return this.invoicesService.adminRunMonth(month);
  }

  @Post(":id/resend")
  resend(@Param("id") id: string) {
    return this.invoicesService.adminResend(id);
  }
}
