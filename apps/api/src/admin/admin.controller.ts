import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import {
  contentReportDecisionNoteSchema,
  resolveContentReportSchema,
  type ContentReportDecisionNoteInput,
  type ResolveContentReportInput,
} from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "./admin.guard";
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

  @Get("users")
  listUsers(@Query("q") q?: string, @Query("role") role?: string, @Query("status") status?: string, @Query("page") page?: string) {
    return this.adminService.listUsers({ q, role, status, page: page ? Number(page) || 1 : 1 });
  }

  @Get("waitlist")
  listWaitlist() {
    return this.adminService.listWaitlist();
  }

  /** Segnalazioni contenuti (richiesta esplicita dell'utente, "Verbale di Conformità" — DSA art. 16). */
  @Get("reports")
  listContentReports(@Query("status") status?: "OPEN" | "RESOLVED" | "DISMISSED") {
    return this.adminService.listContentReports(status);
  }

  @Patch("reports/:id")
  resolveContentReport(@Param("id") id: string, @Body(new ZodValidationPipe(resolveContentReportSchema)) body: ResolveContentReportInput) {
    return this.adminService.resolveContentReport(id, body);
  }

  /** "Annulla misura" (ricorso accolto o errore) — docs/CHANGELOG.md §144. */
  @Post("reports/:id/revert")
  revertContentReport(@Param("id") id: string, @Body(new ZodValidationPipe(contentReportDecisionNoteSchema)) body: ContentReportDecisionNoteInput) {
    return this.adminService.revertContentReport(id, body.note);
  }

  /** Ricorso dell'autore respinto: la misura resta. */
  @Post("reports/:id/reject-appeal")
  rejectAppeal(@Param("id") id: string, @Body(new ZodValidationPipe(contentReportDecisionNoteSchema)) body: ContentReportDecisionNoteInput) {
    return this.adminService.rejectAppeal(id, body.note);
  }

  /** Messaggi dal form "Contatti" del footer (richiesta esplicita dell'utente). */
  @Get("contact-messages")
  listContactMessages(@Query("resolved") resolved?: string) {
    return this.adminService.listContactMessages(resolved === "true");
  }

  /** Richieste "eliminate" dai professionisti: nascoste solo a loro, mai cancellate (docs/CHANGELOG.md §143). */
  @Get("hidden-leads")
  listHiddenLeads() {
    return this.adminService.listHiddenLeads();
  }

  @Patch("contact-messages/:id")
  resolveContactMessage(@Param("id") id: string) {
    return this.adminService.resolveContactMessage(id);
  }
}
