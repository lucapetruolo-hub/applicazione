import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { PrismaClient } from "@professionisti/database";
import { accountingMonthLabel, type AccountantSettingsInput, type PlatformInvoiceSettingsView } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { EmailService } from "../email/email.service";
import { renderEmail, type EmailContent } from "../email/email-layout";
import { EMAIL_BRAND } from "../email/email-brand";
import { ScheduledJob } from "../common/scheduled-job";
import { previousMonth, romeMonthOf } from "./accounting-dates";
import { InvoicesService } from "./invoices.service";

/**
 * Oltre questa misura lo zip non parte per email: Resend accetta al massimo
 * 40 MB, allegato in base64 compreso. Un mese di fatture pesa pochi MB.
 */
export const ACCOUNTANT_ZIP_MAX_BYTES = 25 * 1024 * 1024;

export type AccountantZipResult = "off" | "already" | "empty" | "too-big" | "failed" | "sent";

/**
 * Il commercialista della nostra società (decisione di Luca del 24/11/2026,
 * docs/changelog/2026-11-24-fatture-del-mese-zip.md): con la spunta in
 * Admin → Finanza riceve ogni mese, il 5 alle 9, lo zip delle fatture del mese
 * prima. Il 5 perché le fatture delle trattenute partono il 1° e fino al 15 si
 * recuperano quelle saltate: così arrivano quasi tutte, e il commercialista ha
 * ancora tempo per l'IVA del 16. Mai due volte lo stesso mese
 * (`accountantZipMonth`, segnato prima di mandare e rimesso se l'invio non riesce).
 */
@Injectable()
export class CompanyAccountantService {
  private readonly logger = new Logger(CompanyAccountantService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly emailService: EmailService,
    private readonly invoicesService: InvoicesService,
  ) {}

  async view(): Promise<PlatformInvoiceSettingsView["accountant"]> {
    const row = await this.prisma.platformInvoiceSettings.findUnique({
      where: { id: "default" },
      select: { accountantEmail: true, accountantZipAt: true, accountantZipMonth: true },
    });
    return { email: row?.accountantEmail ?? null, enabled: !!row?.accountantZipAt, lastMonth: row?.accountantZipMonth ?? null };
  }

  async update(input: AccountantSettingsInput, now: Date = new Date()): Promise<PlatformInvoiceSettingsView["accountant"]> {
    const current = await this.prisma.platformInvoiceSettings.findUnique({ where: { id: "default" }, select: { accountantZipAt: true } });
    const data = {
      accountantEmail: input.email || null,
      accountantZipAt: input.enabled ? (current?.accountantZipAt ?? now) : null,
    };
    await this.prisma.platformInvoiceSettings.upsert({ where: { id: "default" }, create: { id: "default", ...data }, update: data });
    return this.view();
  }

  @ScheduledJob("0 9 5 * *", { timeZone: "Europe/Rome" })
  async sendMonthly(now: Date = new Date()): Promise<AccountantZipResult> {
    return this.sendFor(previousMonth(romeMonthOf(now)), now);
  }

  async sendFor(month: string, now: Date = new Date()): Promise<AccountantZipResult> {
    const row = await this.prisma.platformInvoiceSettings.findUnique({
      where: { id: "default" },
      select: { accountantEmail: true, accountantZipAt: true, accountantZipMonth: true },
    });
    if (!row?.accountantZipAt || !row.accountantEmail) return "off";
    // Segna il mese prima di mandare: con due copie dell'API ne parte una sola.
    const claimed = await this.prisma.platformInvoiceSettings.updateMany({
      where: { id: "default", OR: [{ accountantZipMonth: null }, { accountantZipMonth: { lt: month } }] },
      data: { accountantZipMonth: month },
    });
    if (claimed.count === 0) return "already";
    const release = () =>
      this.prisma.platformInvoiceSettings.updateMany({ where: { id: "default", accountantZipMonth: month }, data: { accountantZipMonth: row.accountantZipMonth } });

    let zip: Awaited<ReturnType<InvoicesService["adminMonthZip"]>>;
    try {
      zip = await this.invoicesService.adminMonthZip(month, now);
    } catch (err) {
      await release();
      if (err instanceof NotFoundException) return "empty";
      this.logger.error(`Zip delle fatture di ${month} per il commercialista non preparato: ${err instanceof Error ? err.message : String(err)}`);
      return "failed";
    }
    if (zip.zip.length > ACCOUNTANT_ZIP_MAX_BYTES) {
      await release();
      this.logger.error(`Zip delle fatture di ${month} troppo grande per l'email (${zip.zip.length} byte): va scaricato da Admin → Finanza.`);
      return "too-big";
    }
    const email = renderEmail(companyAccountantZipEmail(month, zip.count, zip.missingXml));
    const ok = await this.emailService.send({
      to: row.accountantEmail,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: [{ filename: zip.fileName, content: zip.zip, contentType: "application/zip" }],
    });
    if (!ok) {
      await release();
      this.logger.error(`Zip delle fatture di ${month} non mandato al commercialista.`);
      return "failed";
    }
    return "sent";
  }
}

/** Email al commercialista della società con lo zip delle fatture del mese. */
export function companyAccountantZipEmail(month: string, count: number, missingXml: number): EmailContent {
  const label = accountingMonthLabel(month);
  return {
    kind: "external",
    subject: `Fatture di ${label} di ${EMAIL_BRAND.name}`,
    greeting: null,
    title: `Fatture di ${label}`,
    paragraphs: [
      `Le mandiamo le fatture emesse da **${EMAIL_BRAND.name}** a ${label}: ${count === 1 ? "una fattura" : `${count} fatture`}, note di credito comprese.`,
      "Nello zip in allegato ci sono il file XML di ogni fattura elettronica, il PDF e un riepilogo da aprire col foglio di calcolo (riepilogo.csv).",
      ...(missingXml > 0
        ? [
            `${missingXml === 1 ? "Una fattura non ha" : `${missingXml} fatture non hanno`} ancora il file XML: ${missingXml === 1 ? "la trova" : "le trova"} solo in PDF, con il motivo nel file da-sistemare.txt. Appena sistemate le riceve dal cassetto fiscale.`,
          ]
        : []),
    ],
    after: [`La riceve perché ${EMAIL_BRAND.name} ha indicato questo indirizzo come quello del suo commercialista. Per non riceverla più basta dircelo.`],
  };
}
