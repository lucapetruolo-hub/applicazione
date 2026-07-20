import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "dev-secret-change-me",
      signOptions: { expiresIn: "30d" },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  // JwtModule va ri-esportato: JwtAuthGuard dipende da JwtService, e i
  // moduli che importano AuthModule per usare la guard (es.
  // GuidedRequestsModule) devono poter risolvere quella dipendenza nel
  // proprio contesto DI, non solo importare la classe della guard.
  exports: [JwtModule, AuthService, JwtAuthGuard],
})
export class AuthModule {}
