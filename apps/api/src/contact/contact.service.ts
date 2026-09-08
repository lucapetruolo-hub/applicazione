import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { ContactMessageInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";

@Injectable()
export class ContactService {
  constructor(@Inject(PRISMA) private readonly prisma: PrismaClient) {}

  async send(input: ContactMessageInput): Promise<{ ok: true }> {
    await this.prisma.contactMessage.create({
      data: { role: input.role, email: input.email, content: input.content },
    });
    return { ok: true };
  }
}
