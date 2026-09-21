import { Injectable, Logger } from "@nestjs/common";
import { Resend } from "resend";

/**
 * Invio email transazionali (Resend) — CEO, tattico: "promemoria automatici
 * via email prima di considerare l'MVP davvero completo" (CLAUDE.md §1: le
 * notifiche/promemoria sono feature core, non accessoria). Stesso principio
 * già seguito per Stripe/Cloudinary/Google in questo progetto: senza la
 * chiave reale (`RESEND_API_KEY`) il servizio non va in crash, semplicemente
 * non invia (logga e ritorna) — il primo consumatore concreto è
 * `BookingRemindersService` (promemoria anti no-show).
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend | null;
  private readonly fromAddress: string;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    this.resend = apiKey ? new Resend(apiKey) : null;
    // Deve essere un dominio verificato su Resend — nessun default reale
    // possibile prima che l'utente configuri il proprio dominio d'invio.
    this.fromAddress = process.env.RESEND_FROM_EMAIL ?? "Professionisti <onboarding@resend.dev>";
  }

  get isConfigured(): boolean {
    return this.resend !== null;
  }

  /**
   * Non lancia mai un'eccezione verso il chiamante: un promemoria mancato
   * non deve mai bloccare un flusso applicativo (creazione booking, cron di
   * sistema) — a differenza degli upload Cloudinary o dei pagamenti Stripe,
   * dove l'assenza di configurazione blocca l'azione con un errore chiaro
   * all'utente, qui l'azione (es. "conferma prenotazione") deve comunque
   * andare a buon fine anche se l'email non parte. Ritorna `true`/`false`
   * solo per permettere al chiamante di loggare/contare gli invii falliti.
   */
  async send(params: { to: string; subject: string; html: string }): Promise<boolean> {
    if (!this.resend) {
      this.logger.warn(`RESEND_API_KEY non configurata: email "${params.subject}" a ${params.to} non inviata.`);
      return false;
    }
    try {
      const result = await this.resend.emails.send({ from: this.fromAddress, to: params.to, subject: params.subject, html: params.html });
      if (result.error) {
        this.logger.error(`Invio email fallito a ${params.to}: ${result.error.message}`);
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error(`Invio email fallito a ${params.to}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }
}
