/**
 * Fornitore dei messaggi WhatsApp, sostituibile (come `TaxIdProvider`,
 * `IdentityProvider`, `SdiProvider`): oggi Meta diretto con la Cloud API
 * (decisione di Luca del 28/10/2026), domani un altro senza toccare chi
 * manda i messaggi.
 */
export type WhatsAppTemplateMessage = {
  /** Numero in formato internazionale, solo cifre (es. "393331234567"). */
  to: string;
  template: string;
  language: string;
  bodyParams: string[];
  /** Parte finale del link del pulsante "Apri" (base fissata nel modello approvato). */
  urlButtonSuffix?: string;
  /** Posizione del pulsante "Apri" nel modello, se non è il primo. */
  urlButtonIndex?: number;
  /** Codice per il pulsante "Copia codice" dei modelli di autenticazione. */
  copyCode?: string;
};

export type WhatsAppStatusUpdate = {
  providerMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  at: Date;
  /** Meta dice se il messaggio si paga e in che categoria (dal webhook "pricing"). */
  billable: boolean | null;
  category: string | null;
  errorCode: string | null;
  errorMessage: string | null;
};

export type WhatsAppInbound = {
  /** Numero di chi scrive, solo cifre. */
  from: string;
  text: string | null;
  /** Risposta rapida premuta ("Non ricevere più", "Ci sarò", "Non posso più"). */
  buttonPayload: string | null;
  /** Id del nostro messaggio a cui risponde (il promemoria con i pulsanti). */
  replyTo: string | null;
};

export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(
    message: WhatsAppTemplateMessage,
  ): Promise<{ providerMessageId: string }>;
  /**
   * Testo libero, solo in risposta a un messaggio della persona nelle
   * ultime 24 ore (la "finestra di servizio" di Meta, gratuita).
   */
  sendText(message: {
    to: string;
    body: string;
    /** Pulsanti di risposta (massimo 3, testo entro 20 caratteri). */
    buttons?: readonly { id: string; title: string }[];
  }): Promise<{ providerMessageId: string }>;
  /** Firma del webhook sul corpo così com'è arrivato. */
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): boolean;
  parseWebhook(body: unknown): {
    statuses: WhatsAppStatusUpdate[];
    inbound: WhatsAppInbound[];
  };
}

/** Errore del fornitore: `permanent` = inutile riprovare (numero senza WhatsApp, modello rifiutato...). */
export class WhatsAppProviderError extends Error {
  constructor(
    message: string,
    readonly code: string | null = null,
    readonly permanent = false,
  ) {
    super(message);
  }
}
