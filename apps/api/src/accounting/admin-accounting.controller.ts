import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { platformInvoiceSettingsSchema, type PlatformInvoiceSettingsInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AuditLogService } from "../audit-log/audit-log.service";
import { AdminGuard, RequireAdminScope } from "../admin/admin.guard";
import { InvoicesService } from "./invoices.service";
import { FeeReconciliationService } from "./fee-reconciliation.service";
import { StatementsService } from "./statements.service";

/** Admin → Finanza: dati della nostra società e le fatture emesse (docs/CHANGELOG.md §378). */
@UseGuards(JwtAuthGuard, AdminGuard)
@RequireAdminScope("FINANCE")
@Controller("admin/invoices")
export class AdminAccountingController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly feeReconciliationService: FeeReconciliationService,
    private readonly statementsService: StatementsService,
    private readonly auditLogService: AuditLogService,
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

  /** Prova d'invio allo SdI nella prova di Openapi (docs/CHANGELOG.md §379). */
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

  /**
   * Rifà il giro del 1° di un mese concluso, se è saltato: fatture delle
   * trattenute, riepilogo ai professionisti ed estratti ai commercialisti
   * (docs/changelog/2026-11-08-infrastruttura-lancio.md). Niente di doppio.
   */
  @Post("run/:month")
  async runMonth(@Req() req: AuthenticatedRequest, @Param("month") month: string) {
    const { issued, notified } = await this.invoicesService.adminRunMonth(month);
    const statements = await this.statementsService.sendAccountantStatementsFor(month);
    // Nel registro azioni (docs/changelog/2026-11-02-admin-protezioni.md).
    await this.auditLogService.record({
      entityType: "InvoiceMonth",
      entityId: month,
      fieldName: "monthRerun",
      newValue: `${issued} fatture, ${notified} riepiloghi, ${statements} estratti`,
      changedByUserId: req.user.userId,
    });
    return { issued, notified, statements };
  }

  @Post(":id/resend")
  async resend(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    const row = await this.invoicesService.adminResend(id);
    await this.auditLogService.record({ entityType: "Invoice", entityId: id, fieldName: "sdiResent", newValue: row.number, changedByUserId: req.user.userId });
    return row;
  }
}
