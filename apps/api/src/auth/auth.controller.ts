import { Body, Controller, Get, Inject, Post, Req, UseGuards } from "@nestjs/common";
import {
  emailPasswordSchema,
  googleVerifySchema,
  registerSchema,
  type EmailPasswordInput,
  type GoogleVerifyInput,
  type RegisterInput,
} from "@professionisti/shared";
import type { PrismaClient } from "@professionisti/database";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PRISMA } from "../prisma/prisma.module";
import { AuthService } from "./auth.service";
import { JwtAuthGuard, type AuthenticatedRequest } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(PRISMA) private readonly prisma: PrismaClient,
  ) {}

  @Post("register")
  async register(@Body(new ZodValidationPipe(registerSchema)) body: RegisterInput) {
    return this.authService.register(body.email, body.password, body.name);
  }

  @Post("login")
  async login(@Body(new ZodValidationPipe(emailPasswordSchema)) body: EmailPasswordInput) {
    return this.authService.login(body.email, body.password);
  }

  @Post("google/verify")
  async verifyGoogle(@Body(new ZodValidationPipe(googleVerifySchema)) body: GoogleVerifyInput) {
    return this.authService.verifyGoogleToken(body.idToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@Req() req: AuthenticatedRequest) {
    const user = await this.prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return null;
    const { id, phone, email, name, role } = user;
    return { id, phone, email, name, role };
  }
}
