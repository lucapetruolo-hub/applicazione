import { z } from "zod";
import "./zod";
import { isValidCodiceFiscale, isValidPartitaIva } from "./fiscalValidation";
import type { ProfessionalCategorySlug } from "./categories";
import { FOUNDER_FREE_MONTHS, TRIAL_DAYS, subscriptionTierInfo, type MySubscription } from "./plans";

/**
 * Documenti contabili e fiscali (decisioni dell'utente del 26-27/10/2026,
 * docs/CHANGELOG.md §372). Il professionista documenta il lavoro al cliente
 * (fattura, documento commerciale o ricevuta per prestazione occasionale):
 * noi gli prepariamo solo una copia di cortesia, mai inviata all'Agenzia.
 * Noi fatturiamo a lui le trattenute sui pagamenti online (una fattura al
 * mese), l'abbonamento e le quote di passaggio, con l'IVA.
 */

/** IVA delle nostre fatture e delle trattenute (22%). */
export const PLATFORM_VAT_RATE_BASIS_POINTS = 2200;

/** IVA su un imponibile, arrotondata al centesimo. */
export function vatOnEurCents(taxableEurCents: number, rateBasisPoints: number = PLATFORM_VAT_RATE_BASIS_POINTS): number {
  return Math.round((taxableEurCents * rateBasisPoints) / 10_000);
}

/**
 * Da un totale con l'IVA dentro: imponibile, IVA e arrotondamento (il
 * centesimo che non torna tra totale e imponibile + IVA, scritto nel campo
 * "Arrotondamento" della fattura elettronica, domanda 60 al commercialista).
 */
export function splitVatEurCents(
  grossEurCents: number,
  rateBasisPoints: number = PLATFORM_VAT_RATE_BASIS_POINTS,
): { taxableEurCents: number; vatEurCents: number; roundingEurCents: number } {
  const taxableEurCents = Math.round((grossEurCents * 10_000) / (10_000 + rateBasisPoints));
  const vatEurCents = vatOnEurCents(taxableEurCents, rateBasisPoints);
  return { taxableEurCents, vatEurCents, roundingEurCents: grossEurCents - taxableEurCents - vatEurCents };
}

/**
 * Il professionista applica l'IVA nelle sue fatture? L'azienda sempre, il
 * privato mai, chi ha la partita IVA come persona lo dice lui nei dati
 * fiscali (no = regime forfettario). `null` finché non ha risposto.
 */
export function professionalChargesVat(entityType: string | null | undefined, chargesVat: boolean | null | undefined): boolean | null {
  if (entityType === "BUSINESS") return true;
  if (entityType === "PRIVATE_INDIVIDUAL") return false;
  if (entityType === "SOLE_PROPRIETOR") return chargesVat ?? null;
  return null;
}

/**
 * Accanto al totale del preventivo (Codice del consumo, art. 49: al
 * consumatore va detto il prezzo finale, tasse comprese). "IVA inclusa"
 * solo per chi la applica: per forfettari e privati sarebbe falso.
 */
export function quotePriceTaxNote(chargesVat: boolean | null): string {
  return chargesVat ? "IVA inclusa" : "Prezzo finale";
}

/** Aiuto nel modulo del preventivo: il prezzo che il professionista scrive è quello finale. */
export function quotePriceHelp(chargesVat: boolean | null): string {
  if (chargesVat === null) return "Scrivi i prezzi finali per il cliente, IVA compresa se la applichi.";
  return chargesVat ? "Scrivi i prezzi finali per il cliente, IVA compresa." : "Scrivi i prezzi finali per il cliente: è quello che paga.";
}

/** Codice destinatario "nessuno": la fattura va nell'area dell'Agenzia delle Entrate del destinatario. */
export const SDI_NO_RECIPIENT_CODE = "0000000";

const PEC_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Codice destinatario (7 caratteri) o PEC, scritti nello stesso campo: con
 * la chiocciola è una PEC. Vuoto o "0000000" = nessuno (facoltativo).
 */
export function parseInvoiceRecipient(
  value: string | null | undefined,
): { ok: true; sdiRecipientCode: string | null; pecEmail: string | null } | { ok: false; error: string } {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return { ok: true, sdiRecipientCode: null, pecEmail: null };
  if (trimmed.includes("@")) {
    return PEC_PATTERN.test(trimmed)
      ? { ok: true, sdiRecipientCode: null, pecEmail: trimmed.toLowerCase() }
      : { ok: false, error: "La PEC non sembra valida." };
  }
  const code = trimmed.toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z0-9]{7}$/.test(code)) return { ok: false, error: "Il codice destinatario ha 7 caratteri, lettere e numeri." };
  return { ok: true, sdiRecipientCode: code === SDI_NO_RECIPIENT_CODE ? null : code, pecEmail: null };
}

/** Il campo unico mostrato nel modulo, dai due valori salvati. */
export function invoiceRecipientText(sdiRecipientCode: string | null | undefined, pecEmail: string | null | undefined): string {
  return sdiRecipientCode ?? pecEmail ?? "";
}

// --- Fattura chiesta dal cliente -------------------------------------------
// Decisione dell'utente del 27/10/2026: "Mi serve la fattura" nell'accettazione
// del preventivo, a nome suo (codice fiscale) o intestata a una partita IVA
// (aziende, ditte, liberi professionisti). Il professionista lo legge
// nell'avviso "Preventivo accettato" e sulla scheda del lavoro: è un dato del
// cliente, visibile solo dopo l'accettazione come gli altri contatti
// (CLAUDE.md §5 punto 9).

export const clientInvoiceKinds = ["PERSON", "VAT"] as const;
export type ClientInvoiceKind = (typeof clientInvoiceKinds)[number];

export const CLIENT_INVOICE_KIND_LABEL: Record<ClientInvoiceKind, string> = {
  PERSON: "A mio nome",
  VAT: "A una partita IVA",
};

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

/** Dati per la fattura chiesti dal cliente, come li vedono lui e il professionista. */
export type ClientInvoiceRequestView = {
  kind: ClientInvoiceKind;
  name: string;
  taxCode: string | null;
  vatNumber: string | null;
  sdiRecipientCode: string | null;
  pecEmail: string | null;
  street: string;
  houseNumber: string | null;
  postalCode: string;
  city: string;
  province: string | null;
  requestedAt: string;
};

/** Righe da copiare nel programma delle fatture, nell'ordine in cui le chiede. */
export function clientInvoiceLines(view: ClientInvoiceRequestView): string[] {
  return [
    view.name,
    view.kind === "VAT" ? `P.IVA ${view.vatNumber ?? ""}` : null,
    view.taxCode ? `Codice fiscale ${view.taxCode}` : null,
    [[view.street, view.houseNumber].filter(Boolean).join(" "), [view.postalCode, view.city, view.province ? `(${view.province})` : null].filter(Boolean).join(" ")].join(", "),
    view.sdiRecipientCode ? `Codice destinatario ${view.sdiRecipientCode}` : view.pecEmail ? `PEC ${view.pecEmail}` : null,
  ].filter((line): line is string => !!line);
}

// --- Detrazioni per i lavori in casa (domanda 28) ----------------------------
// Bonus per ristrutturazioni e risparmio energetico: di solito vanno pagati
// con bonifico "parlante", non con la carta. Avviso nella scelta del
// pagamento per i mestieri della casa, finché il commercialista non risponde.

export const HOME_RENOVATION_CATEGORIES: readonly ProfessionalCategorySlug[] = [
  "idraulico",
  "elettricista",
  "imbianchino",
  "fabbro",
  "climatizzazione",
  "muratore",
  "falegname",
];

export function categoryMayHaveTaxBonus(slug: string | null | undefined): boolean {
  return !!slug && (HOME_RENOVATION_CATEGORIES as readonly string[]).includes(slug);
}

export const TAX_BONUS_PAYMENT_NOTE = {
  short: "Vuoi la detrazione per i lavori in casa? Di solito serve il bonifico parlante, non la carta.",
  more: "Per i bonus su ristrutturazioni e risparmio energetico la legge chiede di pagare con un bonifico \"parlante\" (con la causale del bonus). Se ti interessa, scegli il pagamento diretto e chiedi al professionista i dati per il bonifico.",
};

// --- Le nostre fatture al professionista ------------------------------------
// Trattenute del mese (fattura differita, serie COM), abbonamento, quote di
// passaggio e pacchetti di visibilità (fattura immediata, serie ABB):
// numerazioni separate, domanda 61 al commercialista. Senza i dati della
// nostra società (Admin → Finanza) nessuna fattura: solo l'estratto.

export const platformInvoiceSources = ["JOB_FEES", "SUBSCRIPTION", "UPGRADE_FEE", "VISIBILITY_BOOST"] as const;
export type PlatformInvoiceSource = (typeof platformInvoiceSources)[number];

export const INVOICE_SERIES: Record<PlatformInvoiceSource, string> = {
  JOB_FEES: "COM",
  SUBSCRIPTION: "ABB",
  UPGRADE_FEE: "ABB",
  VISIBILITY_BOOST: "ABB",
};

export const INVOICE_SOURCE_LABEL: Record<PlatformInvoiceSource, string> = {
  JOB_FEES: "Trattenute sui pagamenti online",
  SUBSCRIPTION: "Abbonamento",
  UPGRADE_FEE: "Passaggio al livello superiore",
  VISIBILITY_BOOST: "Pacchetto di visibilità",
};

export const invoiceSdiStatuses = ["NOT_SENT", "SENT", "DELIVERED", "REJECTED"] as const;
export type InvoiceSdiStatusValue = (typeof invoiceSdiStatuses)[number];

/** "COM/2026/0017". */
export function invoiceNumberLabel(series: string | null, year: number | null, number: number | null): string {
  if (!series || !year || !number) return "—";
  return `${series}/${year}/${String(number).padStart(4, "0")}`;
}

const MONTHS_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

/** "2026-10" → "ottobre 2026". */
export function accountingMonthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return month;
  return `${MONTHS_IT[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

/** "2026-10-31T…" → "31 ottobre 2026", all'ora di Roma (pagine dei documenti e PDF). */
export function accountingDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

/** Mese valido nell'indirizzo (AAAA-MM). */
export function isAccountingMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Una riga della fattura: imponibile, con il gruppo (il lavoro) per le trattenute. */
export type PlatformInvoiceLine = { description: string; detail?: string | null; group?: string | null; taxableEurCents: number };

/** Intestazione di chi emette o riceve, già in righe da mostrare. */
export type InvoiceParty = { name: string; lines: string[] };

export type PlatformInvoiceSummary = {
  id: string;
  number: string;
  source: PlatformInvoiceSource;
  creditNote: boolean;
  issuedAt: string;
  periodMonth: string | null;
  totalEurCents: number;
  sdiStatus: InvoiceSdiStatusValue;
};

export type PlatformInvoiceView = PlatformInvoiceSummary & {
  issuer: InvoiceParty;
  recipient: InvoiceParty;
  lines: PlatformInvoiceLine[];
  taxableEurCents: number;
  vatEurCents: number;
  roundingEurCents: number;
  vatRatePercent: number;
  relatedNumber: string | null;
  /** Il professionista recupera l'IVA (ordinario o società)? null se non lo sappiamo. */
  vatRecoverable: boolean | null;
  /** Quanto ha pagato online il cliente nel mese (solo trattenute), per la percentuale. */
  onlinePaidEurCents: number | null;
};

/** Spiegazione sotto il totale di una nostra fattura, in parole semplici. */
export function platformInvoiceNote(invoice: Pick<PlatformInvoiceView, "source" | "creditNote" | "vatRecoverable">): string {
  if (invoice.creditNote) return "Nota di credito: una trattenuta ti è stata restituita. Non devi fare nulla.";
  const paid = invoice.source === "JOB_FEES" ? "È già stata trattenuta dai pagamenti online: non devi pagare nulla." : "È già stata pagata con la carta.";
  if (invoice.vatRecoverable === false) return `${paid} Senza partita IVA, o nel regime forfettario, l'IVA è un costo: non si recupera.`;
  if (invoice.vatRecoverable === true) return `${paid} L'IVA la recuperi nella tua dichiarazione IVA.`;
  return paid;
}

/** Riga sotto il titolo di una nostra fattura: di cosa è e di quando. */
export function platformInvoiceSubtitle(invoice: Pick<PlatformInvoiceView, "source" | "creditNote" | "periodMonth" | "issuedAt">): string {
  if (invoice.source === "JOB_FEES") {
    const month = invoice.periodMonth ? accountingMonthLabel(invoice.periodMonth) : "";
    return invoice.creditNote ? `Trattenute restituite di ${month}.` : `Trattenute sui pagamenti online di ${month}.`;
  }
  return `${INVOICE_SOURCE_LABEL[invoice.source]}, del ${accountingDateLabel(invoice.issuedAt)}.`;
}

/** "Dati per il commercialista": tipo di documento, pagamento e data. */
export function platformInvoiceTechnicalNotes(invoice: Pick<PlatformInvoiceView, "source" | "creditNote" | "relatedNumber" | "issuedAt">): string[] {
  const jobFees = invoice.source === "JOB_FEES";
  return [
    `Tipo di documento: ${invoice.creditNote ? "TD04, nota di credito" : jobFees ? "TD24, fattura differita del mese" : "TD01, fattura"}${invoice.relatedNumber ? `, collegata alla fattura ${invoice.relatedNumber}` : ""}.`,
    `Pagamento: ${jobFees ? "trattenuto dagli incassi dei pagamenti online (MP22)" : "carta (MP08)"}. Data: ${accountingDateLabel(invoice.issuedAt)}.`,
  ];
}

/** Dove trova l'originale elettronico. */
export function platformInvoiceOriginalNote(hasRecipientCode: boolean): string {
  return hasRecipientCode
    ? "L'originale elettronico arriva al tuo programma delle fatture, con il codice destinatario o la PEC che ci hai dato."
    : "L'originale elettronico è nella tua area riservata dell'Agenzia delle Entrate, in Fatture e Corrispettivi.";
}

// --- Estratto del mese ------------------------------------------------------

export type MonthlyStatementRow = {
  jobPaymentId: string | null;
  date: string;
  job: string;
  client: string | null;
  onlineEurCents: number;
  directEurCents: number;
  /** Trattenute del mese su questo lavoro, con l'IVA (negative se restituite). */
  feesEurCents: number;
  payoutEurCents: number | null;
  payoutNote: string;
};

export type MonthlyStatement = {
  month: string;
  monthLabel: string;
  totals: { onlineEurCents: number; directEurCents: number; feesEurCents: number; payoutsArrivedEurCents: number };
  rows: MonthlyStatementRow[];
  /** Soldi ancora bloccati in attesa della conferma dei clienti, per questi lavori. */
  blockedEurCents: number;
  feeInvoice: { id: string; number: string } | null;
  /** Il documento che il professionista dà al cliente per ogni pagamento. */
  documentHint: string;
};

/** Il documento del lavoro che il professionista dà al cliente, per tipo. */
export function clientDocumentHint(entityType: string | null | undefined): string {
  if (entityType === "PRIVATE_INDIVIDUAL") return "Per ogni lavoro ricordati di dare al cliente la ricevuta per prestazione occasionale.";
  if (entityType === "SOLE_PROPRIETOR" || entityType === "BUSINESS") return "Per ogni pagamento ricordati di fare la fattura al cliente.";
  return "Per ogni pagamento ricordati di dare al cliente la fattura o la ricevuta.";
}

/** Una riga dell'estratto per il commercialista (foglio di calcolo, una riga per movimento). */
export type StatementCsvRow = {
  date: string;
  kind: string;
  job: string;
  client: string;
  amountEurCents: number;
  taxableEurCents: number | null;
  vatEurCents: number | null;
  document: string;
};

/** Centesimi all'italiana per il foglio di calcolo: "1234,50". */
function csvAmount(cents: number | null): string {
  if (cents === null) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function csvCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Foglio di calcolo (CSV con il punto e virgola, come lo apre Excel in italiano). */
export function statementCsv(rows: StatementCsvRow[]): string {
  const header = ["Data", "Movimento", "Lavoro", "Cliente", "Importo", "Imponibile", "IVA", "Documento"];
  const body = rows.map((r) =>
    [r.date, r.kind, r.job, r.client, csvAmount(r.amountEurCents), csvAmount(r.taxableEurCents), csvAmount(r.vatEurCents), r.document].map(csvCell).join(";"),
  );
  return `﻿${[header.join(";"), ...body].join("\r\n")}\r\n`;
}

// --- Pagina "Fatture e documenti" ----------------------------------------

export type DocumentsOverview = {
  invoices: PlatformInvoiceSummary[];
  /** Mesi con un estratto (AAAA-MM), dal più recente. */
  months: string[];
  /** Le fatture partono solo con i dati della nostra società (Admin → Finanza). */
  invoicesActive: boolean;
  accountant: { email: string | null; enabled: boolean };
};

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

export type PlatformInvoiceSettingsView = Partial<Record<keyof PlatformInvoiceSettingsInput, string | null>> & {
  ready: boolean;
  sdiConfigured: boolean;
  /** Openapi nell'ambiente di prova (`OPENAPI_SANDBOX=true`): si può fare la prova d'invio (§374). */
  sdiSandbox: boolean;
};

/** Prova d'invio allo SdI nella prova di Openapi, passo per passo (Admin → Finanza, docs/CHANGELOG.md §374). */
export type SdiSandboxTestResult = { ok: boolean; steps: { label: string; ok: boolean; detail: string | null }[] };

// --- Mesi gratuiti: riepilogo a 0 € (non è una fattura) ----------------------
// Decisione dell'utente del 27/10/2026 (docs/CHANGELOG.md §372): un
// documento con le voci e uno sconto che porta a 0 €, nel sito e
// nell'email del mese. Stesse parole del sito: "Offerta di lancio",
// "Mese gratuito", "Mese regalato".

export type FreePeriodSummary = {
  label: "Offerta di lancio" | "Mese gratuito" | "Mese regalato";
  detail: string;
  /** Mese gratuito in corso e quanti in tutto (1 di 3 per l'offerta di lancio). */
  month: number;
  months: number;
  from: string;
  to: string;
  /** Prezzo di Base al mese, IVA esclusa, che lo sconto porta a 0. */
  baseMonthEurCents: number;
};

const FREE_MONTH_MS = TRIAL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Riepilogo del mese gratuito in corso, o null se non è in un periodo
 * gratuito (o prima del lancio, quando i mesi gratuiti non sono partiti).
 */
export function freePeriodSummary(sub: Pick<MySubscription, "state" | "trialEndsAt" | "bonusMonthGranted" | "founder">, now: Date): FreePeriodSummary | null {
  if (sub.state !== "TRIAL" || !sub.trialEndsAt) return null;
  const end = new Date(sub.trialEndsAt).getTime();
  const t = now.getTime();
  const baseMonthEurCents = subscriptionTierInfo("BASE").priceEurCents;
  const iso = (ms: number) => new Date(ms).toISOString();
  if (sub.founder) {
    const start = end - FOUNDER_FREE_MONTHS * FREE_MONTH_MS;
    if (t < start || t >= end) return null;
    const month = Math.min(FOUNDER_FREE_MONTHS, Math.floor((t - start) / FREE_MONTH_MS) + 1);
    const from = start + (month - 1) * FREE_MONTH_MS;
    return { label: "Offerta di lancio", detail: `Primi 100 professionisti, ${FOUNDER_FREE_MONTHS} mesi`, month, months: FOUNDER_FREE_MONTHS, from: iso(from), to: iso(from + FREE_MONTH_MS), baseMonthEurCents };
  }
  const bonus = sub.bonusMonthGranted && t >= end - FREE_MONTH_MS;
  const from = end - FREE_MONTH_MS;
  if (t < (sub.bonusMonthGranted ? end - 2 * FREE_MONTH_MS : from) || t >= end) return null;
  if (bonus) return { label: "Mese regalato", detail: "Un mese in più, regalato da noi", month: 1, months: 1, from: iso(from), to: iso(end), baseMonthEurCents };
  const first = sub.bonusMonthGranted ? end - 2 * FREE_MONTH_MS : from;
  return { label: "Mese gratuito", detail: "Il primo mese, per tutti", month: 1, months: 1, from: iso(first), to: iso(first + FREE_MONTH_MS), baseMonthEurCents };
}

/** Una nostra fattura nella lista di Admin → Finanza. */
export type PlatformInvoiceAdminRow = PlatformInvoiceSummary & {
  professionalProfileId: string;
  recipientName: string;
  sdiMessage: string | null;
  /** XML pronto: senza dati completi del professionista non c'è, e la fattura va sistemata. */
  hasXml: boolean;
};

// --- Copia di cortesia del documento del lavoro ---------------------------------
// Decisione dell'utente del 27/10/2026: la prepariamo noi come cortesia, il
// documento valido lo emette il professionista (fattura elettronica dal suo
// programma, o ricevuta per prestazione occasionale firmata). Non la mandiamo
// mai all'Agenzia delle Entrate.

export type CourtesyCopyView = {
  /** Fattura per chi ha la partita IVA, ricevuta per prestazione occasionale per il privato. */
  kind: "INVOICE" | "RECEIPT";
  issuer: InvoiceParty;
  customer: InvoiceParty;
  date: string;
  description: string;
  /** null se l'importo finale non è noto (si scrive a mano). */
  totalEurCents: number | null;
  /** Solo per chi applica l'IVA: scorporo al 22%. */
  vat: { taxableEurCents: number; vatEurCents: number; ratePercent: number } | null;
  paidHow: string | null;
  /** Righe da riportare nel documento (regime forfettario, marca da bollo, ritenuta). */
  notes: string[];
  /** Il cliente ha chiesto la fattura con i suoi dati. */
  invoiceRequested: boolean;
  /**
   * Numero del documento (docs/CHANGELOG.md §374): per la ricevuta il nostro
   * progressivo dell'anno ("4/2026"), per la fattura quello che il
   * professionista ha scritto (null finché non lo scrive).
   */
  number: string | null;
};

/** Numero della fattura scritto dal professionista sulla copia di cortesia (vuoto per toglierlo). */
export const courtesyNumberSchema = z.object({
  number: z.string().trim().max(30, "Il numero può avere al massimo 30 caratteri.").optional(),
});
export type CourtesyNumberInput = z.infer<typeof courtesyNumberSchema>;

/** Numero della ricevuta come si scrive sul documento: "4/2026". */
export function courtesyReceiptNumber(number: number, year: number): string {
  return `${number}/${year}`;
}

/** Sopra questa cifra, senza IVA, serve la marca da bollo da 2 €. */
export const STAMP_DUTY_THRESHOLD_EUR_CENTS = 7747;

/** Quadratura del mese tra il nostro registro delle trattenute e Stripe (Admin → Finanza). */
export type FeeReconciliation = {
  month: string;
  ledger: { holdsEurCents: number; returnsEurCents: number; costsEurCents: number; cardFeesEurCents: number };
  /** null senza Stripe configurato. */
  stripe: { applicationFeesEurCents: number; applicationFeeRefundsEurCents: number; stripeFeesEurCents: number } | null;
  alerts: string[];
};
