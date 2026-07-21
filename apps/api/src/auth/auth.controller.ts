import { Body, Controller, Delete, Get, Inject, Patch, Post, Req, UseGuards } from "@nestjs/common";
import {
  changePasswordSchema,
  emailPasswordSchema,
  googleVerifySchema,
  registerSchema,
  updateAccountSchema,
  type ChangePasswordInput,
  type EmailPasswordInput,
  type GoogleVerifyInput,
  type RegisterInput,
  type UpdateAccountInput,
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
    return this.authService.register(body.email, body.password, body.name, body.role);
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
    const { id, phone, email, name, surname, birthDate, role, passwordHash } = user;
    return { id, phone, email, name, surname, birthDate, role, hasPassword: Boolean(passwordHash) };
  }

  @UseGuards(JwtAuthGuard)
  @Patch("me")
  async updateMe(@Req() req: AuthenticatedRequest, @Body(new ZodValidationPipe(updateAccountSchema)) body: UpdateAccountInput) {
    const user = await this.authService.updateAccount(req.user.userId, body);
    const { id, phone, email, name, surname, birthDate, role, passwordHash } = user;
    return { id, phone, email, name, surname, birthDate, role, hasPassword: Boolean(passwordHash) };
  }

  @UseGuards(JwtAuthGuard)
  @Post("change-password")
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    await this.authService.changePassword(req.user.userId, body.currentPassword, body.newPassword);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Delete("me")
  async deleteMe(@Req() req: AuthenticatedRequest) {
    await this.authService.deleteAccount(req.user.userId);
    return { success: true };
  }
}
