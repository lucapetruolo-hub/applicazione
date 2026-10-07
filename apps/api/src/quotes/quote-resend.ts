/**
 * Nuovo preventivo dopo un rifiuto del cliente (docs/CHANGELOG.md §188,
 * richiesta esplicita dell'utente). Il tempo a disposizione si conta sempre
 * dall'invio della richiesta, mai dal rifiuto: la finestra è la scadenza
 * della richiesta (`GuidedRequest.expiresAt`, fissata al suo invio), non una
 * nuova scadenza che riparte. Non usa la scadenza del singolo Lead (poche
 * ore dall'arrivo della richiesta): quando il cliente rifiuta è quasi
 * sempre già passata e il nuovo preventivo non sarebbe mai possibile.
 */
export type QuoteResendInput = {
  quoteStatus: string;
  hasBooking: boolean;
  request: { status: string; expiresAt: Date | null; hiddenAt: Date | null };
  clientDeleted: boolean;
};

export function quoteResendWindow(input: QuoteResendInput, now: Date = new Date()): { canResend: boolean; resendUntil: Date | null } {
  const { request } = input;
  const canResend =
    input.quoteStatus === "REJECTED" &&
    !input.hasBooking &&
    !input.clientDeleted &&
    request.status !== "CLOSED" &&
    request.hiddenAt === null &&
    (request.expiresAt === null || request.expiresAt.getTime() > now.getTime());
  return { canResend, resendUntil: canResend ? request.expiresAt : null };
}
