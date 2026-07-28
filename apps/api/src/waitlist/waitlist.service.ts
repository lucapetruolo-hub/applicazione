import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { WaitlistSignupInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class WaitlistService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async signup(input: WaitlistSignupInput): Promise<{ ok: true }> {
    // upsert: reinviare lo stesso form (es. doppio click) non deve fallire
    // con un errore di email duplicata, deve limitarsi a confermare.
    await this.prisma.waitlistSignup.upsert({
      where: { email: input.email },
      update: {},
      create: { email: input.email },
    });
    return { ok: true };
  }
}
