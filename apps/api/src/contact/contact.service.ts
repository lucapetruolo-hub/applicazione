import { Inject, Injectable } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import type { ContactMessageInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class ContactService {
  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly notificationsService: NotificationsService,
  ) {}

  async send(input: ContactMessageInput): Promise<{ ok: true }> {
    const reportIllegal = input.role === "REPORT_ILLEGAL";
    await this.prisma.contactMessage.create({
      // La dichiarazione di buona fede (DSA art. 16 c. 2 lett. d) è
      // obbligatoria per questo tipo e resta scritta nel messaggio.
      data: { role: input.role, email: input.email, content: reportIllegal ? `${input.content}\n\n[Dichiarazione di buona fede confermata]` : input.content },
    });
    if (reportIllegal) this.notificationsService.emailContactReportReceived(input.email);
    return { ok: true };
  }
}
