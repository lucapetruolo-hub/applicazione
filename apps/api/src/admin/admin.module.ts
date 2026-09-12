import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminController } from "./admin.controller";
import { AdminBootstrapController } from "./admin-bootstrap.controller";
import { AdminService } from "./admin.service";
import { AdminGuard } from "./admin.guard";

@Module({
  imports: [AuthModule],
  controllers: [AdminController, AdminBootstrapController],
  providers: [AdminService, AdminGuard],
  // AdminGuard esportata: i nuovi controller finanza/fiscale/DAC7 (CLAUDE.md
  // §88) vivono nei propri moduli ma restano protetti dallo stesso gate
  // amministratori — stessa istanza/dipendenze (PRISMA, globale) di quella
  // già in uso su AdminController.
  exports: [AdminGuard],
})
export class AdminModule {}
