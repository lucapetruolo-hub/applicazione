import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ExternalJobsController } from "./external-jobs.controller";
import { ExternalJobsService } from "./external-jobs.service";

@Module({
  // AuthModule: JwtAuthGuard (usata su ogni rotta di questo controller)
  // dipende da JwtService, risolvibile solo se il modulo che la registra
  // importa AuthModule (che lo esporta) — stesso motivo già documentato in
  // auth.module.ts. Omesso qui in un primo momento: bootstrap di Nest in
  // crash-loop ("Nest can't resolve dependencies of the JwtAuthGuard"),
  // trovato da una verifica end-to-end reale (mai un errore di typecheck).
  imports: [AuthModule],
  controllers: [ExternalJobsController],
  providers: [ExternalJobsService],
})
export class ExternalJobsModule {}
