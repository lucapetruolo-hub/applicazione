import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ProfessionalClientsController } from "./professional-clients.controller";
import { ProfessionalClientsService } from "./professional-clients.service";

/** Rubrica "I miei clienti" (docs/changelog/2026-11-08-rubrica-clienti.md). AuthModule per JwtAuthGuard, come ExternalJobsModule. */
@Module({
  imports: [AuthModule],
  controllers: [ProfessionalClientsController],
  providers: [ProfessionalClientsService],
})
export class ProfessionalClientsModule {}
