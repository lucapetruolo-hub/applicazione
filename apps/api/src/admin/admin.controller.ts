import { Body, Controller, Get, Param, Patch, Query, UseGuards } from "@nestjs/common";
import { resolveContentReportSchema, type ResolveContentReportInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("users")
  listUsers() {
    return this.adminService.listUsersByRole();
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
    return this.adminService.resolveContentReport(id, body.status);
  }
}
