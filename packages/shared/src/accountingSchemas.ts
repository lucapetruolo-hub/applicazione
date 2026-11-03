import { z } from "zod";
import "./zod";
import { isValidCodiceFiscale, isValidPartitaIva } from "./fiscalValidation";
import { RECEIPT_NUMBER_MAX, clientInvoiceKinds, parseInvoiceRecipient } from "./accounting";

/**
 * Controlli dei moduli (zod) di `accounting.ts`, in un file loro: le pagine che
 * usano solo le funzioni di `accounting.ts` non creano questi schemi all'apertura
 * (docs/changelog/2026-11-02-oggi-piu-leggera.md).
 */
export const clientInvoiceRequestSchema = z
  .object({
    kind: z.enum(clientInvoiceKinds),
    /** Nome e cognome, o intestazione (ragione sociale, nome della ditta o dello studio). */
    name: z.string().trim().min(2, "Scrivi il nome a cui intestare la fattura.").max(200),
    taxCode: z.string().trim().max(16).optional(),
    vatNumber: z.string().trim().max(20).optional(),
    /** Codice destinatario o PEC, facoltativo. */
    recipient: z.string().trim().max(254).optional(),
    street: z.string().trim().min(2, "Scrivi la via.").max(200),
    houseNumber: z.string().trim().max(20).optional(),
    postalCode: z.string().trim().regex(/^\d{5}$/, "Il CAP ha 5 cifre."),
    city: z.string().trim().min(2, "Scrivi il comune.").max(120),
    province: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "La provincia è la sigla di 2 lettere, es. RM.").optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "PERSON" && !isValidCodiceFiscale(value.taxCode ?? "")) {
      ctx.addIssue({ code: "custom", path: ["taxCode"], message: "Il codice fiscale non sembra valido." });
    }
    if (value.kind === "VAT" && !isValidPartitaIva(value.vatNumber ?? "")) {
      ctx.addIssue({ code: "custom", path: ["vatNumber"], message: "La partita IVA non sembra valida (11 cifre)." });
    }
    if (value.kind === "VAT" && value.taxCode && !isValidCodiceFiscale(value.taxCode) && !isValidPartitaIva(value.taxCode)) {
      ctx.addIssue({ code: "custom", path: ["taxCode"], message: "Il codice fiscale non sembra valido." });
    }
    const recipient = parseInvoiceRecipient(value.recipient);
    if (!recipient.ok) ctx.addIssue({ code: "custom", path: ["recipient"], message: recipient.error });
  });
export type ClientInvoiceRequestInput = z.infer<typeof clientInvoiceRequestSchema>;

/** Commercialista del professionista: l'estratto del mese gli arriva per email se c'è la spunta. */
export const accountantSettingsSchema = z
  .object({
    email: z.string().trim().toLowerCase().max(254).optional(),
    enabled: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.email)) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "L'email del commercialista non sembra valida." });
    }
    if (value.enabled && !value.email) {
      ctx.addIssue({ code: "custom", path: ["email"], message: "Scrivi l'email del commercialista." });
    }
  });
export type AccountantSettingsInput = z.infer<typeof accountantSettingsSchema>;

/** Dati della nostra società per le fatture, da Admin → Finanza. */
export const platformInvoiceSettingsSchema = z.object({
  companyName: z.string().trim().min(2, "Scrivi la ragione sociale.").max(200),
  vatNumber: z.string().trim().refine((v) => isValidPartitaIva(v), "La partita IVA non sembra valida (11 cifre)."),
  taxCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => !v || isValidPartitaIva(v) || isValidCodiceFiscale(v), "Il codice fiscale non sembra valido.")
    .optional(),
  street: z.string().trim().min(2, "Scrivi la via della sede.").max(200),
  houseNumber: z.string().trim().max(20).optional(),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Il CAP ha 5 cifre."),
  city: z.string().trim().min(2, "Scrivi il comune.").max(120),
  province: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "La provincia è la sigla di 2 lettere."),
  taxRegime: z.string().trim().regex(/^RF\d{2}$/, "Il regime fiscale è un codice come RF01."),
  reaOffice: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "L'ufficio REA è la sigla della provincia.").optional().or(z.literal("")),
  reaNumber: z.string().trim().max(20).optional(),
  shareCapital: z.string().trim().max(20).optional(),
  pecEmail: z.string().trim().toLowerCase().max(254).optional(),
  /** Da quando emettere le fatture (AAAA-MM-GG): prima solo l'estratto. */
  invoicesFrom: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data nel formato AAAA-MM-GG.").optional().or(z.literal("")),
});
export type PlatformInvoiceSettingsInput = z.infer<typeof platformInvoiceSettingsSchema>;

/**
 * Cosa il professionista scrive sulla ricevuta prima di scaricarla (collaudo
 * del 29/10/2026): il numero (dal 02/11/2026 lo dà lui,
 * docs/changelog/2026-11-02-ricevuta-modello.md), nome e codice fiscale del
 * cliente se non li ha dati lui, ritenuta. Un campo vuoto toglie il valore.
 */
export const courtesyDetailsSchema = z.object({
  number: z
    .string()
    .trim()
    .max(RECEIPT_NUMBER_MAX, `Il numero può avere al massimo ${RECEIPT_NUMBER_MAX} caratteri.`)
    .regex(/^[0-9A-Za-z/\-. ]*$/, "Nel numero usa solo cifre, lettere, barra o trattino.")
    .optional(),
  customerName: z.string().trim().max(120, "Il nome può avere al massimo 120 caratteri.").optional(),
  customerTaxCode: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .refine((value) => !value || isValidCodiceFiscale(value) || isValidPartitaIva(value), "Il codice fiscale non sembra valido."),
  withholding: z.boolean().optional(),
});
export type CourtesyDetailsInput = z.infer<typeof courtesyDetailsSchema>;
