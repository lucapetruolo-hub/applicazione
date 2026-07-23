import { BadRequestException, Body, Controller, ForbiddenException, Post } from "@nestjs/common";
import { adminBootstrapSchema, type AdminBootstrapInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AdminService } from "./admin.service";

// Controller separato (non AdminController): quella rotta è protetta da
// JwtAuthGuard + AdminGuard, che richiedono di essere già ADMIN — impossibile
// per promuovere il primissimo admin. Qui la protezione è un segreto
// condiviso (ADMIN_BOOTSTRAP_SECRET) invece di un JWT, stesso principio delle
// altre integrazioni "solo variabili d'ambiente, mai committate" (CLAUDE.md §5.7).
@Controller("admin")
export class AdminBootstrapController {
  constructor(private readonly adminService: AdminService) {}

  @Post("bootstrap")
  async bootstrap(@Body(new ZodValidationPipe(adminBootstrapSchema)) body: AdminBootstrapInput) {
    const expectedSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expectedSecret) {
      throw new BadRequestException(
        "La promozione admin non è configurata su questo ambiente. Aggiungi ADMIN_BOOTSTRAP_SECRET per attivarla.",
      );
    }
    if (body.secret !== expectedSecret) {
      throw new ForbiddenException("Codice non valido.");
    }
    return this.adminService.promoteToAdmin(body.email);
  }
}
