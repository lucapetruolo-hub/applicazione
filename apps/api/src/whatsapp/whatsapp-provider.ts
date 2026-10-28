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
  /** Risposta rapida premuta ("Non ricevere più"). */
  buttonPayload: string | null;
};

export interface WhatsAppProvider {
  readonly name: string;
  sendTemplate(
    message: WhatsAppTemplateMessage,
  ): Promise<{ providerMessageId: string }>;
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
