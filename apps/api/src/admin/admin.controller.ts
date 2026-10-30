import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  adminRoleUpdateSchema,
  contentReportDecisionNoteSchema,
  type AdminRoleUpdateInput,
  resolveContentReportSchema,
  siteNoteSchema,
  siteAdviceDoneSchema,
  siteAdviceUndoSchema,
  type SiteAdviceDoneInput,
  type SiteAdviceUndoInput,
  type SiteNoteInput,
  resolveJobIssueSchema,
  resolveJobIssueAppealSchema,
  jobIssueInfoRequestSchema,
  type ResolveJobIssueAppealInput,
  type JobIssueInfoRequestInput,
  type ResolveJobIssueInput,
  type ContentReportDecisionNoteInput,
  type ResolveContentReportInput,
  adminQueueClaimSchema,
  type AdminQueueClaimInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "./admin.guard";
import { AdminService } from "./admin.service";
import { SiteStatsService } from "./site-stats.service";
import { AdminQueueService } from "./admin-queue.service";
import { JobIssueOutcomeService } from "../job-issues/job-issue-outcome.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly jobIssueOutcomeService: JobIssueOutcomeService,
    private readonly siteStatsService: SiteStatsService,
    private readonly adminQueueService: AdminQueueService,
  ) {}

  /** Coda "Da fare": ogni tipo di caso solo a chi ha il ruolo per deciderlo (docs/changelog/2026-10-30-admin-riordino.md). */
  @RequireAdminScope("ANY")
  @Get("queue")
  queue(@Req() req: AuthenticatedRequest) {
    return this.adminQueueService.getQueue(req.user.userId);
  }

  @RequireAdminScope("ANY")
  @Post("queue/claim")
  @HttpCode(204)
  async claimCase(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(adminQueueClaimSchema)) body: AdminQueueClaimInput): Promise<void> {
    await this.adminQueueService.claim(req.user.userId, body.caseKey);
  }

  @RequireAdminScope("ANY")
  @Post("queue/release")
  @HttpCode(204)
  async releaseCase(@Body(new ZodValidationPipe(adminQueueClaimSchema)) body: AdminQueueClaimInput): Promise<void> {
    await this.adminQueueService.release(body.caseKey);
  }

  /** Andamento del sito e consigli della settimana (docs/CHANGELOG.md §372). */
  @RequireAdminScope("ANY")
  @Get("site-stats")
  siteStats() {
    return this.siteStatsService.getStats();
  }

  /** Quante persone spengono ogni avviso (docs/changelog/2026-10-29-notifiche-email-riassunto-e-notte.md). */
  @RequireAdminScope("ANY")
  @Get("notification-opt-outs")
  notificationOptOuts() {
    return this.adminService.notificationOptOuts();
  }

  /** Nota sul grafico dell'andamento (es. "chiamati 20 idraulici a Latina"). */
  @RequireAdminScope("ANY")
  @Post("site-notes")
  addSiteNote(@Body(new ZodValidationPipe(siteNoteSchema)) body: SiteNoteInput) {
    return this.siteStatsService.addNote(body);
  }

  @RequireAdminScope("ANY")
  @Delete("site-notes/:id")
  @HttpCode(204)
  async deleteSiteNote(@Param("id") id: string): Promise<void> {
    await this.siteStatsService.deleteNote(id);
  }

  /** "Fatto" su un consiglio della settimana (super admin): non torna per 14 giorni (§372). */
  @RequireAdminScope("SUPER")
  @Post("site-advice/done")
  @HttpCode(204)
  async markSiteAdviceDone(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(siteAdviceDoneSchema)) body: SiteAdviceDoneInput): Promise<void> {
    await this.siteStatsService.markAdviceDone(req.user.userId, body);
  }

  @RequireAdminScope("SUPER")
  @Post("site-advice/undo")
  @HttpCode(204)
  async undoSiteAdviceDone(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(siteAdviceUndoSchema)) body: SiteAdviceUndoInput): Promise<void> {
    await this.siteStatsService.undoAdviceDone(req.user.userId, body);
  }

  /** Contatori della home admin (docs/CHANGELOG.md §144). */
  @RequireAdminScope("ANY")
  @Get("overview")
  overview() {
    return this.adminService.getOverview();
  }

  /** Andamento settimanale per la Home (docs/CHANGELOG.md §145). */
  @RequireAdminScope("ANY")
  @Get("trends")
  trends() {
    return this.adminService.getTrends();
  }

  /** Da dove arrivano le richieste di preventivo, ultimi 30 giorni (docs/CHANGELOG.md §296). */
  @RequireAdminScope("ANY")
  @Get("traffic-sources")
  trafficSources() {
    return this.adminService.getTrafficSources();
  }

  /** Ricerca globale ⌘K (docs/CHANGELOG.md §145). */
  @RequireAdminScope("ANY")
  @Get("search")
  search(@Query("q") q = "") {
    return this.adminService.search(q);
  }

  /** Professionisti in numeri, con i filtri per categoria e città (docs/CHANGELOG.md §368). */
  @RequireAdminScope("ANY")
  @Get("professionals/stats")
  professionalStats(@Query("category") category?: string, @Query("city") city?: string) {
    return this.adminService.getProfessionalStats({ category, city });
  }

  @RequireAdminScope("ANY")
  @Get("users")
  listUsers(
    @Query("q") q?: string,
    @Query("role") role?: string,
    @Query("status") status?: string,
    @Query("category") category?: string,
    @Query("city") city?: string,
    @Query("page") page?: string,
  ) {
    return this.adminService.listUsers({ q, role, status, category, city, page: page ? Number(page) || 1 : 1 });
  }

  // Tutti gli utenti con i contatti in un file: solo moderatori (controllo sicurezza, §292).
  @RequireAdminScope("MODERATION")
  @Get("users/export.csv")
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="utenti.csv"')
  exportUsers(
    @Query("q") q?: string,
    @Query("role") role?: string,
    @Query("status") status?: string,
    @Query("category") category?: string,
    @Query("city") city?: string,
  ) {
    return this.adminService.exportUsersCsv({ q, role, status, category, city });
  }

  /** Scheda utente con cronologia (docs/CHANGELOG.md §145). */
  @RequireAdminScope("ANY")
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

  /** Elimina per sempre un account di prova e tutto quello che ha creato (docs/CHANGELOG.md §372) — solo super admin. */
  @RequireAdminScope("SUPER")
  @Delete("users/:id/test-account")
  deleteTestAccount(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.adminService.deleteTestAccount(req.user.userId, id);
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

  /** Richieste eliminate dai clienti: nascoste solo a loro, cancellate dopo 90 giorni se non segnalate (docs/CHANGELOG.md §343). */
  @RequireAdminScope("MODERATION")
  @Get("client-deleted-requests")
  listClientDeletedRequests() {
    return this.adminService.listClientDeletedRequests();
  }

  // Chat tra cliente e professionista (docs/CHANGELOG.md §166): moderazione,
  // perché sono conversazioni private; ogni lettura va nel registro azioni.
  @RequireAdminScope("MODERATION")
  @Get("conversations")
  listConversations(@Query("q") q?: string) {
    return this.adminService.listConversations(q);
  }

  @RequireAdminScope("MODERATION")
  @Get("conversations/:guidedRequestId/:professionalProfileId")
  getConversation(
    @Req() req: AuthenticatedRequest,
    @Param("guidedRequestId") guidedRequestId: string,
    @Param("professionalProfileId") professionalProfileId: string,
  ) {
    return this.adminService.getConversation(req.user.userId, guidedRequestId, professionalProfileId);
  }

  // Segnalazioni di problemi sul lavoro (docs/CHANGELOG.md §164): qualunque
  // admin, come "Lavori terminati".
  @RequireAdminScope("ANY")
  @Get("job-issues")
  listJobIssues(@Req() req: AuthenticatedRequest, @Query("view") view?: string, @Query("q") q?: string) {
    return this.adminService.listJobIssues(view === "closed" || view === "chat" || view === "appeals" ? view : "open", req.user.userId, q ?? "");
  }

  @RequireAdminScope("ANY")
  @Patch("job-issues/:id")
  resolveJobIssue(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(resolveJobIssueSchema)) body: ResolveJobIssueInput) {
    return this.adminService.resolveJobIssue(req.user.userId, id, body);
  }

  /** Richiesta di informazioni al professionista: 72 ore per rispondere (§167). */
  @RequireAdminScope("ANY")
  @Patch("job-issues/:id/request-info")
  requestJobIssueInfo(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(jobIssueInfoRequestSchema)) body: JobIssueInfoRequestInput) {
    return this.jobIssueOutcomeService.requestInfo(req.user.userId, id, body.text.trim());
  }

  /** Decisione sul ricorso del professionista, da un admin diverso da chi ha deciso (§167). */
  @RequireAdminScope("ANY")
  @Patch("job-issues/:id/appeal")
  decideJobIssueAppeal(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(resolveJobIssueAppealSchema)) body: ResolveJobIssueAppealInput) {
    return this.jobIssueOutcomeService.decideAppeal(req.user.userId, id, { decision: body.decision, note: body.note.trim() });
  }

  // Qualunque admin: note e differenze di prezzo servono sia alla
  // moderazione sia alla finanza (contestazioni).
  @RequireAdminScope("ANY")
  @Get("completed-jobs")
  listCompletedJobs(@Query("filter") filter?: string) {
    return this.adminService.listCompletedJobs(filter === "changes" || filter === "notes" ? filter : "all");
  }

  @RequireAdminScope("MODERATION")
  @Patch("contact-messages/:id")
  resolveContactMessage(@Param("id") id: string) {
    return this.adminService.resolveContactMessage(id);
  }
}
