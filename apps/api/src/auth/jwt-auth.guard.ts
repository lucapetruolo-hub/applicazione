import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export type AuthenticatedRequest = Request & { user: { userId: string } };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

    if (!token) {
      throw new UnauthorizedException("Token mancante.");
    }

    try {
      const payload = this.jwt.verify<{ sub: string }>(token);
      (request as AuthenticatedRequest).user = { userId: payload.sub };
      return true;
    } catch {
      throw new UnauthorizedException("Token non valido o scaduto.");
    }
  }
}
