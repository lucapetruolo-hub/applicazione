import { Body, Controller, Delete, ForbiddenException, Get, Header, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import {
  adminRoleUpdateSchema,
  contentReportDecisionNoteSchema,
  adminAccountMeasureSchema,
  type AdminAccountMeasureInput,
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
  adminModerateSchema,
  type AdminModerateInput,
  invitePartnerCreateSchema,
  type InvitePartnerCreateInput,
  siteDeadlineSchema,
  type SiteDeadlineInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { AdminGuard, RequireAdminScope } from "./admin.guard";
import { AdminService } from "./admin.service";
import { SiteStatsService } from "./site-stats.service";
import { AdminQueueService } from "./admin-queue.service";
import { SiteHealthService } from "./site-health.service";
import { CaseAdviceService } from "./case-advice.service";
import { SuspiciousAccountsService } from "./suspicious-accounts.service";
import { JobIssueOutcomeService } from "../job-issues/job-issue-outcome.service";
import { InvitePartnersService } from "./invite-partners.service";
import { pdfResponse, renderDocumentPdf } from "../accounting/document-pdf";
import { pdfFileName } from "../accounting/document-pdf-models";
import { AuditLogService } from "../audit-log/audit-log.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly jobIssueOutcomeService: JobIssueOutcomeService,
    private readonly siteStatsService: SiteStatsService,
    private readonly suspiciousAccountsService: SuspiciousAccountsService,
    private readonly adminQueueService: AdminQueueService,
    private readonly invitePartners: InvitePartnersService,
    private readonly auditLogService: AuditLogService,
    private readonly siteHealthService: SiteHealthService,
    private readonly caseAdviceService: CaseAdviceService,
  ) {}

  /** Scadenze del sito e controllo della notte (docs/changelog/2026-11-13-admin-scadenze-controlli.md). */
  @RequireAdminScope("SUPER")
  @Get("site-health")
  siteHealth() {
    return this.siteHealthService.getHealth();
  }

  @RequireAdminScope("SUPER")
  @Post("site-deadlines")
  addSiteDeadline(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(siteDeadlineSchema)) body: SiteDeadlineInput) {
    return this.siteHealthService.addDeadline(req.user.userId, body);
  }

  @RequireAdminScope("SUPER")
  @Post("site-deadlines/:id/done")
  @HttpCode(204)
  async markSiteDeadlineDone(@Req() req: AuthenticatedRequest, @Param("id") id: string): Promise<void> {
    await this.siteHealthService.markDeadlineDone(req.user.userId, id);
  }

  @RequireAdminScope("SUPER")
  @Delete("site-deadlines/:id")
  @HttpCode(204)
  async deleteSiteDeadline(@Req() req: AuthenticatedRequest, @Param("id") id: string): Promise<void> {
    await this.siteHealthService.deleteDeadline(req.user.userId, id);
  }

  /** Link d'invito dei partner, con gli iscritti arrivati da ciascuno (docs/changelog/2026-11-09-passaparola.md). */
  @RequireAdminScope("ANY")
  @Get("invite-partners")
  invitePartnerList() {
    return this.invitePartners.list();
  }

  @RequireAdminScope("SUPER")
  @Post("invite-partners")
  async createInvitePartner(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(invitePartnerCreateSchema)) body: InvitePartnerCreateInput) {
    const partner = await this.invitePartners.create(body);
    await this.auditLogService.record({ entityType: "InvitePartner", entityId: partner.id, fieldName: "create", newValue: { name: partner.name, code: partner.code }, changedByUserId: req.user.userId });
    return partner;
  }

  /** Scheda in PDF da stampare o mandare al partner, con il suo link e il QR. */
  @RequireAdminScope("ANY")
  @Get("invite-partners/:id/sheet.pdf")
  async invitePartnerSheet(@Param("id") id: string) {
    const { model, fileName } = await this.invitePartners.sheet(id);
    return pdfResponse(await renderDocumentPdf(model), pdfFileName(fileName));
  }

  @RequireAdminScope("SUPER")
  @Post("invite-partners/:id/archive")
  @HttpCode(204)
  async archiveInvitePartner(@Req() req: AuthenticatedRequest, @Param("id") id: string): Promise<void> {
    await this.invitePartners.archive(id);
    await this.auditLogService.record({ entityType: "InvitePartner", entityId: id, fieldName: "archivedAt", newValue: true, changedByUserId: req.user.userId });
  }

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

  /** Imbuto dell'iscrizione per settimana (docs/changelog/2026-10-30-iscrizione-carta-solida.md). */
  @RequireAdminScope("ANY")
  @Get("professionals/signup-funnel")
  signupFunnel() {
    return this.adminService.getSignupFunnel();
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

  /** "Nascondi la recensione" / "Togli dalla ricerca" dalla scheda (docs/changelog/2026-10-30-admin-persone.md). */
  @RequireAdminScope("MODERATION")
  @Post("users/:id/moderate")
  moderateFromUserPage(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(adminModerateSchema)) body: AdminModerateInput) {
    return this.adminService.moderateFromUserPage(req.user.userId, id, body);
  }

  /** Pubblica una recensione in controllo (collaudo P-01); per nasconderla si usa "users/:id/moderate". */
  @RequireAdminScope("MODERATION")
  @Post("reviews/:id/publish")
  publishHeldReview(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.adminService.publishHeldReview(req.user.userId, id);
  }

  /** Account con almeno un segnale da controllare, dal controllo del mattino (docs/changelog/2026-10-30-admin-persone.md). */
  @RequireAdminScope("MODERATION")
  @Get("suspicious-users")
  suspiciousUsers() {
    return this.suspiciousAccountsService.list();
  }

  /** "Controlla ora": rifà subito il controllo, senza avvisare gli altri admin. */
  @RequireAdminScope("MODERATION")
  @Post("suspicious-users/check")
  @HttpCode(200)
  async checkSuspiciousUsers() {
    await this.suspiciousAccountsService.check({ notify: false });
    return this.suspiciousAccountsService.list();
  }

  /** "Va bene così" con il motivo: esce da "Cosa fare" finché non arriva un segnale nuovo. */
  @RequireAdminScope("MODERATION")
  @Post("suspicious-users/:id/dismiss")
  @HttpCode(204)
  async dismissSuspiciousUser(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(contentReportDecisionNoteSchema)) body: ContentReportDecisionNoteInput): Promise<void> {
    await this.suspiciousAccountsService.dismiss(req.user.userId, id, body.note);
  }

  @RequireAdminScope("MODERATION")
  @Delete("suspicious-users/:id/dismiss")
  @HttpCode(204)
  async undismissSuspiciousUser(@Req() req: AuthenticatedRequest, @Param("id") id: string): Promise<void> {
    await this.suspiciousAccountsService.undismiss(req.user.userId, id);
  }

  @RequireAdminScope("MODERATION")
  @Post("users/:id/suspend")
  suspendUser(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body(new ZodValidationPipe(adminAccountMeasureSchema)) body: AdminAccountMeasureInput) {
    return this.adminService.suspendUser(req.user.userId, id, body);
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
    return this.adminService.setAdminRoles(req.user.userId, id, body.adminRoles, body.reason);
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

  /** Proposte dell'IA nei casi di Da fare e quante sono state approvate (docs/changelog/2026-11-13-admin-ia-propone.md). */
  // Ognuno vede le proposte dei casi del suo ruolo (moderazione, finanza).
  @RequireAdminScope("ANY")
  @Get("case-advice")
  async caseAdviceOverview(@Req() req: AuthenticatedRequest) {
    return this.caseAdviceService.overview(await this.caseAdviceService.kindsFor(req.user.userId));
  }

  /** "Approva": decide come propone l'IA, con gli stessi servizi dei pulsanti a mano. */
  @RequireAdminScope("ANY")
  @Post("case-advice/:kind/:caseId/approve")
  async approveCaseAdvice(@Req() req: AuthenticatedRequest, @Param("kind") kind: string, @Param("caseId") caseId: string) {
    if (!(await this.caseAdviceService.kindsFor(req.user.userId)).includes(kind as never)) throw new ForbiddenException("Questa sezione non rientra nel tuo ruolo di amministratore.");
    return this.adminService.approveCaseAdvice(req.user.userId, kind, caseId);
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

  /** "Annulla" subito dopo "Segna come gestito" e "Riapri" dall'archivio (docs/changelog/2026-11-03-admin-dopo-la-misura.md). */
  @RequireAdminScope("MODERATION")
  @Patch("contact-messages/:id/reopen")
  reopenContactMessage(@Param("id") id: string) {
    return this.adminService.resolveContactMessage(id, false);
  }
}
