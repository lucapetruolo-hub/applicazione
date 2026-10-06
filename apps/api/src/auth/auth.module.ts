import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ProfessionalMetricsModule } from "../professional-metrics/professional-metrics.module";
import { EmailModule } from "../email/email.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { VerifiedEmailGuard } from "./verified-email.guard";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
      signOptions: { expiresIn: "30d" },
    }),
    ProfessionalMetricsModule,
    EmailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, VerifiedEmailGuard],
  // JwtModule va ri-esportato: JwtAuthGuard dipende da JwtService, e i
  // moduli che importano AuthModule per usare la guard (es.
  // GuidedRequestsModule) devono poter risolvere quella dipendenza nel
  // proprio contesto DI, non solo importare la classe della guard.
  exports: [JwtModule, AuthService, JwtAuthGuard, VerifiedEmailGuard],
})
export class AuthModule {}
