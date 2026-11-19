import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@professionisti/database";
import { FREE_SPREADSHEET_FILE, type FreeSpreadsheetSignupInput } from "@professionisti/shared";
import { PRISMA } from "../prisma/prisma.module";
import { EmailService } from "../email/email.service";
import { renderEmail, type EmailContent } from "../email/email-layout";
import { EMAIL_BRAND, frontendUrl } from "../email/email-brand";
import { ScheduledJob } from "../common/scheduled-job";

/** Lo stesso indirizzo riceve il link al massimo una volta ogni 10 minuti. */
const RESEND_AFTER_MS = 10 * 60 * 1000;
/** Senza consenso alle novità l'indirizzo si cancella dopo 25 mesi (come i conteggi del sito). */
const KEEP_MS = 25 * 31 * 24 * 60 * 60 * 1000;

/**
 * Excel gratuito "Entrate e uscite" dalla pagina /per-professionisti
 * (docs/changelog/2026-11-19-entrate-e-uscite.md, decisione di Luca del
 * 19/11/2026: già acceso per il lancio). L'email riceve il link: è la
 * conferma che l'indirizzo è suo (doppia conferma), e solo da lì vale il
 * consenso facoltativo alle novità.
 */
@Injectable()
export class FreeSpreadsheetService {
  private readonly logger = new Logger(FreeSpreadsheetService.name);

  constructor(
    @Inject(PRISMA) private readonly prisma: PrismaClient,
    private readonly emailService: EmailService,
  ) {}

  async signup(input: FreeSpreadsheetSignupInput, now: Date = new Date()): Promise<{ ok: true }> {
    const existing = await this.prisma.freeSpreadsheetSignup.findUnique({ where: { email: input.email } });
    // Stessa risposta in ogni caso: non si deve capire se un indirizzo è già nell'elenco.
    if (existing && now.getTime() - existing.lastSentAt.getTime() < RESEND_AFTER_MS) return { ok: true };
    const row = existing
      ? await this.prisma.freeSpreadsheetSignup.update({
          where: { id: existing.id },
          // Il consenso si può dare anche la seconda volta, mai togliere qui senza un clic.
          data: { lastSentAt: now, marketingConsent: existing.marketingConsent || input.marketingConsent },
        })
      : await this.prisma.freeSpreadsheetSignup.create({
          data: { email: input.email, token: randomBytes(24).toString("base64url"), marketingConsent: input.marketingConsent, lastSentAt: now },
        });
    const email = renderEmail(freeSpreadsheetEmail(`${frontendUrl()}/per-professionisti/excel-gratuito?codice=${encodeURIComponent(row.token)}`));
    const sent = await this.emailService.send({ to: row.email, subject: email.subject, html: email.html, text: email.text });
    if (!sent) this.logger.warn("Email dell'Excel gratuito non mandata (Resend non configurato o errore).");
    return { ok: true };
  }

  /** Clic sul link dell'email: l'indirizzo è confermato e il file si scarica. */
  async confirm(token: string, now: Date = new Date()): Promise<{ fileUrl: string }> {
    const row = token.length >= 20 && token.length <= 64 ? await this.prisma.freeSpreadsheetSignup.findUnique({ where: { token } }) : null;
    if (!row) throw new BadRequestException("Il link non è più valido: chiedi di nuovo il file.");
    await this.prisma.freeSpreadsheetSignup.update({ where: { id: row.id }, data: { confirmedAt: row.confirmedAt ?? now, downloads: { increment: 1 } } });
    return { fileUrl: `/${FREE_SPREADSHEET_FILE}` };
  }

  /** Ogni notte: via gli indirizzi senza consenso alle novità più vecchi di 25 mesi. */
  @ScheduledJob("40 3 * * *")
  async cleanup(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.freeSpreadsheetSignup.deleteMany({ where: { marketingConsent: false, createdAt: { lt: new Date(now.getTime() - KEEP_MS) } } });
    return count;
  }
}

export function freeSpreadsheetEmail(url: string): EmailContent {
  return {
    kind: "external",
    externalReason: `Ricevi questa email perché hai chiesto l'Excel gratuito "Entrate e uscite" su ${EMAIL_BRAND.name}.`,
    subject: "Il tuo Excel delle entrate e uscite",
    greeting: null,
    title: "Ecco il tuo Excel",
    paragraphs: [
      "Grazie per averlo chiesto. Con il pulsante qui sotto scarichi il foglio: scrivi entrate e spese di ogni mese e lui calcola da solo i totali e quanto ti resta.",
      "Si apre con Excel, Numbers e Google Fogli. Quando è il momento, dallo al tuo commercialista: gli farà risparmiare tempo.",
    ],
    cta: { label: "Scarica l'Excel", url },
    after: [`Se sei un professionista, su ${EMAIL_BRAND.name} lo stesso lavoro si fa da solo, con i lavori già dentro.`],
  };
}
