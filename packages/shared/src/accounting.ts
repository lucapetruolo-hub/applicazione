import { z } from "zod";
import "./zod";
import { isValidCodiceFiscale, isValidPartitaIva } from "./fiscalValidation";
import type { ProfessionalCategorySlug } from "./categories";
import { formatEurCents } from "./professionals";
import { FOUNDER_FREE_MONTHS, TRIAL_DAYS, subscriptionTierInfo, type MySubscription } from "./plans";

/**
 * Documenti contabili e fiscali (decisioni dell'utente del 26-27/10/2026,
 * docs/CHANGELOG.md §378). Il professionista documenta il lavoro al cliente
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
    // A una partita IVA solo il codice fiscale della ditta (11 cifre), mai quello di una persona (collaudo G-06).
    view.taxCode && (view.kind === "PERSON" || /^\d{11}$/.test(view.taxCode)) ? `Codice fiscale ${view.taxCode}` : null,
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
  /** Rimborsato al cliente nel mese, anche per una contestazione in banca persa (collaudo G-12). */
  refundsEurCents: number;
  /** Contestazione in banca aperta: il pagamento è fuori dai totali finché la banca non decide (G-15). */
  disputed: boolean;
};

export type MonthlyStatement = {
  month: string;
  monthLabel: string;
  /**
   * `onlineEurCents` è già senza i rimborsi del mese (`refundsEurCents`) e
   * senza i pagamenti contestati in banca (`disputedEurCents`), collaudo G-12 e G-15.
   */
  totals: { onlineEurCents: number; directEurCents: number; feesEurCents: number; payoutsArrivedEurCents: number; refundsEurCents: number; disputedEurCents: number };
  rows: MonthlyStatementRow[];
  /** Soldi ancora bloccati in attesa della conferma dei clienti: la stessa cifra di "Pagamenti online" (G-14), senza i contestati. */
  blockedEurCents: number;
  feeInvoice: { id: string; number: string } | null;
  /** Le nostre fatture delle trattenute sono partite per questo mese (dati della società e data di partenza in Admin → Finanza). */
  feeInvoiceExpected: boolean;
  /** Il documento che il professionista dà al cliente per ogni pagamento. */
  documentHint: string;
};

/** La riga sotto i totali che spiega cosa resta fuori da "Pagato online" (collaudo G-12, G-15). */
export function statementOnlineNote(statement: Pick<MonthlyStatement, "totals">): string | null {
  const eur = formatEurCents;
  const parts = [
    statement.totals.refundsEurCents > 0 ? `i rimborsi ai clienti (${eur(statement.totals.refundsEurCents)})` : null,
    statement.totals.disputedEurCents > 0 ? `i pagamenti contestati in banca (${eur(statement.totals.disputedEurCents)}), che contano solo se la banca ti dà ragione` : null,
  ].filter((part): part is string => !!part);
  return parts.length > 0 ? `"Pagato online" è già senza ${parts.join(" e senza ")}.` : null;
}

/**
 * La riga sulla fattura delle trattenute in fondo all'estratto (collaudo
 * G-16): prima che le nostre fatture partano non si promette una fattura
 * che non arriva.
 */
export function statementFeeInvoiceNote(statement: Pick<MonthlyStatement, "feeInvoice" | "feeInvoiceExpected" | "totals">): string | null {
  if (statement.feeInvoice) return `Le trattenute del mese sono nella fattura ${statement.feeInvoice.number}.`;
  if (statement.totals.feesEurCents === 0) return null;
  return statement.feeInvoiceExpected
    ? "La fattura delle trattenute arriva il 1° del mese dopo."
    : "Per questo mese non arriva una nostra fattura delle trattenute: le fatture partono con l'apertura del sito. Le trattenute sono tutte in questo estratto.";
}

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

export type MissingClientDocument = {
  bookingId: string;
  /** Giorno del lavoro terminato. */
  date: string;
  jobLabel: string | null;
  customerName: string | null;
  amountEurCents: number;
};

export type DocumentsOverview = {
  invoices: PlatformInvoiceSummary[];
  /** Ricevute e copie di cortesia date ai clienti, dalla più recente (§381). */
  clientDocuments: CourtesyDocumentSummary[];
  /**
   * Lavori terminati pagati online senza la ricevuta scaricata, solo per chi
   * lavora senza partita IVA (docs/changelog/2026-10-30-documenti-migliorie.md).
   */
  missingDocuments: MissingClientDocument[];
  /** Lavora senza partita IVA: le ricevute ai clienti le prepara qui (docs/changelog/2026-10-30-documenti-snelli.md). */
  receipts: boolean;
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
  /** Openapi nell'ambiente di prova (`OPENAPI_SANDBOX=true`): si può fare la prova d'invio (§379). */
  sdiSandbox: boolean;
};

/** Prova d'invio allo SdI nella prova di Openapi, passo per passo (Admin → Finanza, docs/CHANGELOG.md §379). */
export type SdiSandboxTestResult = { ok: boolean; steps: { label: string; ok: boolean; detail: string | null }[] };

// --- Mesi gratuiti: riepilogo a 0 € (non è una fattura) ----------------------
// Decisione dell'utente del 27/10/2026 (docs/CHANGELOG.md §378): un
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

// --- Ricevuta per prestazione occasionale --------------------------------------
// Decisione dell'utente del 27/10/2026: la prepariamo noi, il documento valido
// è quello firmato dal professionista. Non la mandiamo mai all'Agenzia delle
// Entrate. Dal 30/10/2026 solo per chi lavora senza partita IVA: chi ce l'ha
// fa la fattura elettronica col suo programma, che gli dà già il PDF, e qui
// trova solo i dati del cliente da copiare
// (docs/changelog/2026-10-30-documenti-snelli.md).

export type CourtesyCopyView = {
  kind: "RECEIPT";
  issuer: InvoiceParty;
  customer: InvoiceParty;
  /** Il giorno del pagamento, o del lavoro terminato. */
  date: string;
  /** Le voci del lavoro terminato (B-03, C-18). */
  lines: { description: string; amountEurCents: number }[];
  /** null se l'importo finale non è noto (si scrive a mano). */
  totalEurCents: number | null;
  /**
   * Ricevuta a una partita IVA (C-04): se il cliente trattiene la ritenuta
   * d'acconto del 20%, quanto trattiene e quanto paga davvero.
   */
  withholding: { applies: boolean; amountEurCents: number; netEurCents: number } | null;
  paidHow: string | null;
  /** Righe da riportare nel documento (prestazione occasionale, fuori campo IVA, marca da bollo). */
  notes: string[];
  /** Consigli solo per il professionista, sullo schermo e mai nel PDF (C-04). */
  hints: string[];
  /** Il cliente ha chiesto la ricevuta con i suoi dati. */
  invoiceRequested: boolean;
  /**
   * Senza richiesta del cliente il professionista scrive (o corregge) nome e
   * codice fiscale del cliente (C-05, G-07): i valori di partenza sono qui.
   */
  customerFields: { name: string; taxCode: string } | null;
  /** Il nostro progressivo dell'anno ("4/2026", docs/CHANGELOG.md §379). */
  number: string | null;
  /** Cosa manca prima di scaricare il PDF: vuoto se è pronto. */
  missing: string[];
  /** Importo sull'ultimo PDF scaricato, null se non l'ha mai scaricato: se è diverso da oggi va rifatto (§381). */
  pdfTotalEurCents?: number | null;
};

/** Ritenuta d'acconto sulle ricevute a una partita IVA (C-04). */
export const WITHHOLDING_RATE_PERCENT = 20;

/**
 * Cosa il professionista scrive sulla ricevuta prima di scaricarla (collaudo
 * del 29/10/2026): nome e codice fiscale del cliente se non li ha dati lui,
 * ritenuta. Un campo vuoto toglie il valore.
 */
export const courtesyDetailsSchema = z.object({
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

/** Numero della ricevuta come si scrive sul documento: "4/2026". */
export function courtesyReceiptNumber(number: number, year: number): string {
  return `${number}/${year}`;
}

/** Come si chiama la ricevuta nelle liste: "Ricevuta n. 4/2026". */
export function courtesyDocumentLabel(doc: { number: number | null; year: number }): string {
  return doc.number ? `Ricevuta n. ${courtesyReceiptNumber(doc.number, doc.year)}` : "Ricevuta senza numero";
}

/**
 * Un documento dato a un cliente, in Admin → Documenti ai clienti
 * (docs/CHANGELOG.md §380): per l'assistenza e le segnalazioni, con chi l'ha
 * preparato, per chi, e se il PDF scaricato aveva un importo diverso da oggi.
 */
export type AdminCourtesyDocumentRow = {
  bookingId: string;
  kind: "RECEIPT";
  label: string;
  year: number;
  /** Quando il professionista l'ha preparato la prima volta. */
  createdAt: string;
  pdfDownloadedAt: string | null;
  /** Importo sull'ultimo PDF scaricato. */
  pdfTotalEurCents: number | null;
  /** Importo del lavoro oggi (dopo rimborsi o cambi): null se non è noto. */
  totalEurCents: number | null;
  invoiceRequested: boolean;
  categoryLabel: string | null;
  city: string | null;
  scheduledAt: string;
  bookingCanceled: boolean;
  guidedRequestId: string | null;
  professional: { profileId: string; userId: string; businessName: string };
  client: { userId: string; name: string | null; accountDeleted: boolean };
};

/**
 * Un documento dato a un cliente, visto dal professionista (docs/CHANGELOG.md
 * §381): in "Fatture e documenti" con il totale dell'anno, e sul lavoro se
 * l'importo è cambiato dopo che ha scaricato il PDF (un rimborso, per esempio).
 */
export type CourtesyDocumentSummary = {
  bookingId: string;
  kind: "RECEIPT";
  label: string;
  year: number;
  customerName: string | null;
  jobLabel: string | null;
  /** Importo di oggi; null se non è noto. */
  totalEurCents: number | null;
  pdfDownloadedAt: string | null;
  /** Importo sull'ultimo PDF scaricato. */
  pdfTotalEurCents: number | null;
  /** L'importo di oggi non è quello del PDF scaricato: va rifatto. */
  amountChanged: boolean;
};

/**
 * Importo del documento: quanto è stato pagato online (meno i rimborsi), o
 * il totale del lavoro. Con l'acconto online e il saldo diretto conta il
 * totale del lavoro, non il solo acconto.
 */
export function courtesyTotalEurCents(
  jp: { paymentMethod: string; paidEurCents: number; refundedEurCents: number; grossAmountEurCents: number; balanceDirect?: boolean } | null,
): number | null {
  if (!jp) return null;
  return jp.paymentMethod === "MANOVIA" && !jp.balanceDirect && jp.paidEurCents > 0 ? jp.paidEurCents - jp.refundedEurCents : jp.grossAmountEurCents;
}

/** L'importo è cambiato dopo il PDF scaricato (mai prima del primo PDF). */
export function courtesyAmountChanged(pdfTotalEurCents: number | null, totalEurCents: number | null): boolean {
  return pdfTotalEurCents !== null && pdfTotalEurCents !== totalEurCents;
}

/** Totali per anno delle ricevute date ai clienti, dal più recente: per la dichiarazione dei redditi. */
export function courtesyYearTotals(documents: CourtesyDocumentSummary[]): { year: number; kind: "RECEIPT"; count: number; totalEurCents: number; missingAmounts: number }[] {
  const totals = new Map<number, { year: number; kind: "RECEIPT"; count: number; totalEurCents: number; missingAmounts: number }>();
  for (const doc of documents) {
    const row = totals.get(doc.year) ?? { year: doc.year, kind: "RECEIPT" as const, count: 0, totalEurCents: 0, missingAmounts: 0 };
    row.count += 1;
    if (doc.totalEurCents === null) row.missingAmounts += 1;
    else row.totalEurCents += doc.totalEurCents;
    totals.set(doc.year, row);
  }
  return [...totals.values()].sort((a, b) => b.year - a.year);
}

/** Sopra questa cifra, senza IVA, serve la marca da bollo da 2 €. */
export const STAMP_DUTY_THRESHOLD_EUR_CENTS = 7747;

/** Un documento nel riepilogo dell'anno per il commercialista (docs/CHANGELOG.md §382). */
export type CourtesyYearRow = {
  /** "4/2026"; null se la ricevuta non ha ancora il numero. */
  number: string | null;
  /** Data del documento (ISO). */
  date: string;
  /** Il nome sulla ricevuta: quello dei dati dati dal cliente, o del cliente. */
  customerName: string | null;
  /** Il cliente ha chiesto il documento intestato a una partita IVA. */
  customerHasVatNumber: boolean;
  /** Codice fiscale o partita IVA del cliente, per abbinare il documento (G-04). */
  customerTaxId: string | null;
  /** Quando il cliente ha pagato (ISO): lavoro terminato o pagamento online. */
  paidAt: string | null;
  jobLabel: string | null;
  /** Importo del documento: quello del PDF dato al cliente, o di oggi se non l'ha ancora scaricato (G-10). */
  totalEurCents: number | null;
  /** Importo di oggi, se è cambiato dopo il PDF (un rimborso): va fatto un nuovo documento. */
  currentEurCents: number | null;
  /** Ricevuta a una partita IVA con la ritenuta del 20%: quanto ha trattenuto il cliente. */
  withholdingEurCents: number | null;
  /** Oltre 77,47 €: marca da bollo da 2 €. */
  stampDuty: boolean;
  amountChanged: boolean;
};

/** Le ricevute di un anno, da dare al commercialista. */
export type CourtesyYearSummary = {
  year: number;
  /** Nome del professionista per il commercialista. */
  who: string | null;
  receipts: CourtesyYearRow[];
};

/** Un movimento di soldi del lavoro, nei documenti della richiesta (docs/CHANGELOG.md §386). */
export type JobDocumentMovement = {
  /** Data (ISO). */
  date: string;
  label: string;
  /** Per chi guarda: positivo se entra, negativo se esce. */
  amountEurCents: number;
  /** Fattura delle nostre trattenute che lo contiene (solo per il professionista). */
  invoice: { id: string; number: string } | null;
};

/**
 * I documenti contabili di un lavoro, dal menu della richiesta (decisione
 * dell'utente del 27/10/2026, docs/CHANGELOG.md §386), per il professionista
 * e per il cliente.
 */
export type JobDocumentsView = {
  audience: "PROFESSIONAL" | "CLIENT";
  bookingId: string;
  /**
   * La ricevuta per il cliente. Il cliente la vede solo dopo che il
   * professionista ha scaricato il PDF, con lo stesso importo.
   */
  clientDocument: { label: string; kind: "RECEIPT"; amountChanged: boolean } | null;
  /** Il professionista la può già preparare: lavoro terminato, senza partita IVA. */
  clientDocumentAvailable: boolean;
  /** Il professionista ha la partita IVA: la fattura la fa col suo programma (docs/changelog/2026-10-30-documenti-snelli.md). */
  ownInvoice: boolean;
  /** Il cliente ha chiesto la fattura al professionista. */
  invoiceRequested: boolean;
  movements: JobDocumentMovement[];
  /** Solo per il professionista: gli estratti dei mesi dei movimenti ("2026-10"). */
  statementMonths: { month: string; label: string }[];
};

/** Totale e conteggi di una parte del riepilogo dell'anno. */
export function courtesyYearPart(rows: CourtesyYearRow[]): {
  totalEurCents: number;
  withholdingEurCents: number;
  withVatNumber: number;
  stampDuty: number;
  missingAmounts: number;
  amountChanged: number;
} {
  return rows.reduce(
    (acc, row) => ({
      totalEurCents: acc.totalEurCents + (row.totalEurCents ?? 0),
      withholdingEurCents: acc.withholdingEurCents + (row.withholdingEurCents ?? 0),
      withVatNumber: acc.withVatNumber + (row.customerHasVatNumber ? 1 : 0),
      stampDuty: acc.stampDuty + (row.stampDuty ? 1 : 0),
      missingAmounts: acc.missingAmounts + (row.totalEurCents === null ? 1 : 0),
      amountChanged: acc.amountChanged + (row.amountChanged ? 1 : 0),
    }),
    { totalEurCents: 0, withholdingEurCents: 0, withVatNumber: 0, stampDuty: 0, missingAmounts: 0, amountChanged: 0 },
  );
}

/** Giorno in ora italiana, come nell'estratto: "2026-10-27". */
function romeDayIso(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
}

/** Il riepilogo dell'anno nel foglio di calcolo (come l'estratto: punto e virgola, importi all'italiana). */
export function courtesyYearCsv(summary: CourtesyYearSummary): string {
  const header = ["Documento", "Numero", "Data", "Cliente", "Codice fiscale o partita IVA", "Cliente con partita IVA", "Data di incasso", "Lavoro", "Importo", "Ritenuta d'acconto", "Marca da bollo", "Importo di oggi"];
  const line = (kind: string, r: CourtesyYearRow) =>
    [
      kind,
      r.number ?? "",
      romeDayIso(r.date),
      r.customerName ?? "",
      r.customerTaxId ?? "",
      r.customerHasVatNumber ? "Sì" : "No",
      r.paidAt ? romeDayIso(r.paidAt) : "",
      r.jobLabel ?? "",
      csvAmount(r.totalEurCents),
      csvAmount(r.withholdingEurCents),
      r.stampDuty ? "Sì" : "No",
      r.amountChanged ? csvAmount(r.currentEurCents) : "",
    ]
      .map(csvCell)
      .join(";");
  const body = summary.receipts.map((r) => line("Ricevuta per prestazione occasionale", r));
  return `\ufeff${[header.join(";"), ...body].join("\r\n")}\r\n`;
}

/** Quadratura del mese tra il nostro registro delle trattenute e Stripe (Admin → Finanza). */
export type FeeReconciliation = {
  month: string;
  ledger: { holdsEurCents: number; returnsEurCents: number; costsEurCents: number; cardFeesEurCents: number };
  /** null senza Stripe configurato. */
  stripe: { applicationFeesEurCents: number; applicationFeeRefundsEurCents: number; stripeFeesEurCents: number } | null;
  alerts: string[];
};
