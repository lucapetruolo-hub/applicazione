import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  adminRoleUpdateSchema,
  contentReportDecisionNoteSchema,
  type AdminRoleUpdateInput,
  resolveContentReportSchema,
  type ContentReportDecisionNoteInput,
  type ResolveContentReportInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "./admin.guard";
import { AdminService } from "./admin.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /** Contatori della home admin (docs/CHANGELOG.md §144). */
  @Get("overview")
  overview() {
    return this.adminService.getOverview();
  }

  /** Andamento settimanale per la Home (docs/CHANGELOG.md §145). */
  @Get("trends")
  trends() {
    return this.adminService.getTrends();
  }

  /** Ricerca globale ⌘K (docs/CHANGELOG.md §145). */
  @Get("search")
  search(@Query("q") q = "") {
    return this.adminService.search(q);
  }

  @Get("users")
  listUsers(@Query("q") q?: string, @Query("role") role?: string, @Query("status") status?: string, @Query("page") page?: string) {
    return this.adminService.listUsers({ q, role, status, page: page ? Number(page) || 1 : 1 });
  }

  @Get("users/export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="utenti.csv"')
  exportUsers(@Query("q") q?: string, @Query("role") role?: string, @Query("status") status?: string) {
    return this.adminService.exportUsersCsv({ q, role, status });
  }

  /** Scheda utente con cronologia (docs/CHANGELOG.md §145). */
  @Get("users/:id")
  getUser(@Param("id") id: string) {
    return this.adminService.getUserDetail(id);
  }

  @RequireAdminScope("MODERATION")
  @Post("users/:id/suspend")
  suspendUser(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(contentReportDecisionNoteSchema)) body: ContentReportDecisionNoteInput) {
    return this.adminService.suspendUser(req.user.userId, id, body.note);
  }

  @RequireAdminScope("MODERATION")
  @Post("users/:id/reactivate")
  reactivateUser(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(contentReportDecisionNoteSchema)) body: ContentReportDecisionNoteInput) {
    return this.adminService.reactivateUser(req.user.userId, id, body.note);
  }

  /** Assegna/toglie il ruolo admin — solo super admin. */
  @RequireAdminScope("SUPER")
  @Patch("users/:id/admin-role")
  setAdminRole(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(adminRoleUpdateSchema)) body: AdminRoleUpdateInput) {
    return this.adminService.setAdminRoles(req.user.userId, id, body.adminRoles);
  }

  /** Registro delle azioni admin — solo super admin. */
  @RequireAdminScope("SUPER")
  @Get("audit-log")
  auditLog(@Query("page") page?: string, @Query("entityType") entityType?: string) {
    return this.adminService.listAuditLog({ page: page ? Number(page) || 1 : 1, entityType: entityType || undefined });
  }

  @RequireAdminScope("MODERATION")
  @Get("waitlist")
  listWaitlist() {
    return this.adminService.listWaitlist();
  }

  @RequireAdminScope("MODERATION")
  @Get("waitlist/export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="lista-attesa.csv"')
  exportWaitlist() {
    return this.adminService.exportWaitlistCsv();
  }

  /** Segnalazioni contenuti (richiesta esplicita dell'utente, "Verbale di Conformità" — DSA art. 16). */
  @RequireAdminScope("MODERATION")
  @Get("reports")
  listContentReports(@Query("status") status?: "OPEN" | "RESOLVED" | "DISMISSED") {
    return this.adminService.listContentReports(status);
  }

  /** Contenuto segnalato per intero, anche se già nascosto o sospeso (docs/CHANGELOG.md §145). */
  @RequireAdminScope("MODERATION")
  @Get("reports/:id/target")
  getReportTarget(@Param("id") id: string) {
    return this.adminService.getReportTarget(id);
  }

  @RequireAdminScope("MODERATION")
  @Patch("reports/:id")
  resolveContentReport(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(resolveContentReportSchema)) body: ResolveContentReportInput) {
    return this.adminService.resolveContentReport(id, body, req.user.userId);
  }

  /** "Annulla misura" (ricorso accolto o errore) — docs/CHANGELOG.md §144. */
  @RequireAdminScope("MODERATION")
  @Post("reports/:id/revert")
  revertContentReport(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(contentReportDecisionNoteSchema)) body: ContentReportDecisionNoteInput) {
    return this.adminService.revertContentReport(id, body.note, req.user.userId);
  }

  /** Ricorso dell'autore respinto: la misura resta. */
  @RequireAdminScope("MODERATION")
  @Post("reports/:id/reject-appeal")
  rejectAppeal(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(contentReportDecisionNoteSchema)) body: ContentReportDecisionNoteInput) {
    return this.adminService.rejectAppeal(id, body.note, req.user.userId);
  }

  /** Messaggi dal form "Contatti" del footer (richiesta esplicita dell'utente). */
  @RequireAdminScope("MODERATION")
  @Get("contact-messages")
  listContactMessages(@Query("resolved") resolved?: string) {
    return this.adminService.listContactMessages(resolved === "true");
  }

  /** Richieste "eliminate" dai professionisti: nascoste solo a loro, mai cancellate (docs/CHANGELOG.md §143). */
  @RequireAdminScope("MODERATION")
  @Get("hidden-leads")
  listHiddenLeads() {
    return this.adminService.listHiddenLeads();
  }

  @RequireAdminScope("MODERATION")
  @Patch("contact-messages/:id")
  resolveContactMessage(@Param("id") id: string) {
    return this.adminService.resolveContactMessage(id);
  }
}
