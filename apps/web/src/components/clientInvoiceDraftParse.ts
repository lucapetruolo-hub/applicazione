import { clientInvoiceRequestSchema, type ClientInvoiceRequestInput } from "@professionisti/shared";
import type { InvoiceDraft } from "./ClientInvoiceRequestForm";

// Controllo dei dati per la fattura, in un file a parte caricato solo all'invio:
// porta con sé zod, che "Le mie richieste" non deve scaricare all'apertura
// (docs/changelog/2026-11-09-le-mie-richieste-leggera.md).

/** Dati pronti per l'API, o il primo errore per campo. */
export function parseInvoiceDraft(
  draft: InvoiceDraft,
  receipt = false,
): { ok: true; data: ClientInvoiceRequestInput } | { ok: false; errors: Partial<Record<keyof InvoiceDraft, string>> } {
  const parsed = clientInvoiceRequestSchema.safeParse({
    kind: draft.kind,
    name: draft.name,
    // A una partita IVA mai il codice fiscale di una persona, rimasto dalla scelta "A nome mio" (collaudo G-06).
    taxCode: draft.kind === "PERSON" ? draft.taxCode.trim() || undefined : undefined,
    vatNumber: draft.kind === "VAT" ? draft.vatNumber.trim() || undefined : undefined,
    // Codice destinatario e PEC servono solo alla fattura elettronica, non alla ricevuta (C-01).
    recipient: draft.kind === "VAT" && !receipt ? draft.recipient.trim() || undefined : undefined,
    street: draft.street,
    houseNumber: draft.houseNumber.trim() || undefined,
    postalCode: draft.postalCode,
    city: draft.city,
    province: draft.province.trim() || undefined,
  });
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: Partial<Record<keyof InvoiceDraft, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof InvoiceDraft | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return { ok: false, errors };
}
