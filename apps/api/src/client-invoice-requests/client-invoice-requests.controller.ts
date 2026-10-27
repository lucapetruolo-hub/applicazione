import { Body, Controller, Delete, Get, Param, Put, Req, UseGuards } from "@nestjs/common";
import { clientInvoiceRequestSchema, type ClientInvoiceRequestInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { JwtAuthGuard, type AuthenticatedRequest } from "../auth/jwt-auth.guard";
import { ClientInvoiceRequestsService } from "./client-invoice-requests.service";

/** Fattura chiesta dal cliente al professionista (docs/CHANGELOG.md §374). */
@Controller("client-invoice-requests")
@UseGuards(JwtAuthGuard)
export class ClientInvoiceRequestsController {
  constructor(private readonly clientInvoiceRequestsService: ClientInvoiceRequestsService) {}

  /** Ultimi dati usati, per precompilare. */
  @Get("last")
  async last(@Req() req: AuthenticatedRequest) {
    return { invoiceRequest: await this.clientInvoiceRequestsService.lastForClient(req.user.userId) };
  }

  /** Chiede la fattura per un lavoro già accettato, o cambia i dati. */
  @Put(":quoteId")
  save(@Req() req: AuthenticatedRequest, @Param("quoteId") quoteId: string, @Body(new ZodValidationPipe(clientInvoiceRequestSchema)) body: ClientInvoiceRequestInput) {
    return this.clientInvoiceRequestsService.saveAfterAcceptance(req.user.userId, quoteId, body);
  }

  @Delete(":quoteId")
  async remove(@Req() req: AuthenticatedRequest, @Param("quoteId") quoteId: string) {
    await this.clientInvoiceRequestsService.removeForClient(req.user.userId, quoteId);
    return { ok: true };
  }
}
