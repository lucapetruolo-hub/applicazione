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
    // Nome, indirizzo del contenuto e dichiarazione di buona fede (DSA art.
    // 16 c. 2 lett. b-d) restano scritti nel messaggio, letto in Admin.
    const content = reportIllegal
      ? `Segnalato da: ${input.reporterName ?? ""}\nPagina: ${input.contentUrl ?? ""}\n\n${input.content}\n\n[Dichiarazione di buona fede confermata]`
      : input.content;
    await this.prisma.contactMessage.create({ data: { role: input.role, email: input.email, content } });
    if (reportIllegal) this.notificationsService.emailContactReportReceived(input.email);
    return { ok: true };
  }
}
