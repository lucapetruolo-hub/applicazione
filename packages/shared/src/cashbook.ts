// Entrate e uscite del professionista (docs/changelog/2026-11-19-entrate-e-uscite.md).
//
// Prima nota di cassa: ogni soldo che entra o esce è una riga con la sua data
// (il giorno in cui il soldo si muove, non quello del lavoro) e i totali sono
// solo somme di righe. Le righe del sito vengono dallo stesso calcolo
// dell'estratto del mese, così Statistiche, estratto, scheda e foglio
// dell'anno danno la stessa cifra.
//
// È uno strumento incluso nell'abbonamento, non una consulenza fiscale
// (CLAUDE.md §5 punto 18): le stime si dicono sempre "da confermare con il
// tuo commercialista".
import { z } from "zod";
import "./zod";
import { csvCell } from "./csv";

// --- Spese ------------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  { key: "MATERIALS", label: "Materiali", example: "Tubi, cavi, vernici, ricambi" },
  { key: "VEHICLE", label: "Veicolo e carburante", example: "Benzina, pedaggi, tagliando" },
  { key: "TOOLS", label: "Attrezzi", example: "Trapano, scala, aspirapolvere" },
  { key: "PHONE", label: "Telefono e internet", example: "Ricarica, abbonamento" },
  { key: "INSURANCE", label: "Assicurazione", example: "Responsabilità civile" },
  { key: "TRAINING", label: "Corsi e certificazioni", example: "Patentino, corso sicurezza" },
  { key: "SOCIAL_SECURITY", label: "Contributi INPS", example: "Rata dei contributi" },
  { key: "OTHER", label: "Altro", example: "Commercialista, cancelleria" },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];
export const EXPENSE_CATEGORY_KEYS = EXPENSE_CATEGORIES.map((c) => c.key) as [ExpenseCategory, ...ExpenseCategory[]];

export function expenseCategoryLabel(key: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? "Altro";
}

/** Una spesa sola non supera 100.000 €: oltre è quasi sempre un errore di battitura. */
export const EXPENSE_MAX_EUR_CENTS = 10_000_000;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida.");

export const expenseInputSchema = z.object({
  spentOn: isoDay,
  amountEurCents: z.number().int().min(1, "Scrivi l'importo.").max(EXPENSE_MAX_EUR_CENTS, "L'importo è troppo alto."),
  category: z.enum(EXPENSE_CATEGORY_KEYS),
  description: z.string().trim().max(120).optional().nullable(),
  receiptPhotoUrl: z.string().url().max(500).optional().nullable(),
});
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

// --- Impostazioni -----------------------------------------------------------

/**
 * Coefficienti di redditività del forfettario (legge 190/2014, allegato 4),
 * per gruppi di codici ATECO. Il professionista sceglie il suo; il
 * commercialista lo conferma.
 */
export const FORFETTARIO_COEFFICIENTS = [
  { key: "COSTRUZIONI", percent: 86, label: "Costruzioni e impianti", hint: "Idraulico, elettricista, imbianchino, muratore (ATECO 41-43)" },
  { key: "ALTRE", percent: 67, label: "Altri servizi", hint: "Pulizie, giardiniere, traslochi, riparazioni" },
  { key: "PROFESSIONI", percent: 78, label: "Attività professionali e tecniche", hint: "Geometra, progettista, insegnante" },
  { key: "INTERMEDIARI", percent: 62, label: "Intermediari del commercio", hint: "Agenti e rappresentanti" },
  { key: "COMMERCIO", percent: 40, label: "Commercio e ristorazione", hint: "Negozi, alimentari, bar" },
  { key: "AMBULANTI", percent: 54, label: "Commercio ambulante non alimentare", hint: "Banchi al mercato" },
] as const;

export type ForfettarioCoefficientKey = (typeof FORFETTARIO_COEFFICIENTS)[number]["key"];
const COEFFICIENT_KEYS = FORFETTARIO_COEFFICIENTS.map((c) => c.key) as [ForfettarioCoefficientKey, ...ForfettarioCoefficientKey[]];

/** Imposta sostitutiva: 5% i primi cinque anni (se si hanno i requisiti), poi 15%. */
export const FORFETTARIO_RATES = [5, 15] as const;

/** Aliquote IVA che il professionista può applicare, per separare l'IVA dagli incassi. */
export const CASHBOOK_VAT_RATES = [22, 10, 5, 4] as const;

/** Soglia dei ricavi del forfettario: oltre si esce dal regime l'anno dopo. */
export const FORFETTARIO_LIMIT_EUR_CENTS = 8_500_000;
/** Oltre questa cifra si esce dal forfettario subito, nello stesso anno. */
export const FORFETTARIO_EXIT_EUR_CENTS = 10_000_000;
/** Da qui l'avviso per tempo. */
export const FORFETTARIO_WARN_EUR_CENTS = 7_000_000;

export const cashbookSettingsSchema = z.object({
  includeExternalJobs: z.boolean(),
  taxEstimate: z
    .object({
      coefficient: z.enum(COEFFICIENT_KEYS),
      ratePercent: z.union([z.literal(5), z.literal(15)]),
    })
    .nullable(),
  vatRatePercent: z.union([z.literal(22), z.literal(10), z.literal(5), z.literal(4)]),
});
export type CashbookSettings = z.infer<typeof cashbookSettingsSchema>;

export const DEFAULT_CASHBOOK_SETTINGS: CashbookSettings = { includeExternalJobs: true, taxEstimate: null, vatRatePercent: 22 };

// --- Righe e riepiloghi -----------------------------------------------------

export type CashbookSource =
  /** Pagamento online del cliente (acconto o saldo). */
  | "ONLINE"
  /** Pagamento diretto al professionista per un lavoro del sito. */
  | "DIRECT"
  /** Rimborso al cliente o contestazione persa: soldi che tornano indietro. */
  | "REFUND"
  /** Lavoro preso fuori dal sito, segnato in agenda con un prezzo. */
  | "EXTERNAL"
  /** Nostra trattenuta sui pagamenti online (fattura COM). */
  | "FEE"
  /** Abbonamento, quota di passaggio o pacchetto (fattura ABB). */
  | "PLATFORM_INVOICE"
  /** Spesa scritta a mano dal professionista. */
  | "EXPENSE";

export type CashbookMovement = {
  /** Giorno del movimento, ora italiana (AAAA-MM-GG). */
  date: string;
  source: CashbookSource;
  /** Cosa è, in parole semplici ("Pagamento online del cliente", "Materiali"). */
  label: string;
  /** Lavoro o descrizione. */
  detail: string;
  /** Positivo se entra, negativo se esce. */
  amountEurCents: number;
  /** IVA dentro l'importo, quando si conosce. */
  vatEurCents: number | null;
  /** Documento collegato (fattura, ricevuta). */
  document: string;
  /** Solo per le spese scritte a mano: per modificarle. */
  expenseId?: string;
  category?: ExpenseCategory;
  receiptPhotoUrl?: string | null;
  /** Solo per i lavori: per aprire il lavoro. */
  bookingId?: string;
};

/** Le fonti che sono entrate (anche negative, come i rimborsi). */
export const INCOME_SOURCES: readonly CashbookSource[] = ["ONLINE", "DIRECT", "REFUND", "EXTERNAL"];

export function isIncome(source: CashbookSource): boolean {
  return INCOME_SOURCES.includes(source);
}

export type CashbookTotals = {
  /** Entrate meno rimborsi. */
  incomeEurCents: number;
  /** Uscite, come numero positivo. */
  expensesEurCents: number;
  /** Entrate − uscite. */
  leftEurCents: number;
};

export function cashbookTotals(movements: readonly Pick<CashbookMovement, "source" | "amountEurCents">[]): CashbookTotals {
  let income = 0;
  let expenses = 0;
  for (const m of movements) {
    if (isIncome(m.source)) income += m.amountEurCents;
    else expenses -= m.amountEurCents;
  }
  return { incomeEurCents: income, expensesEurCents: expenses, leftEurCents: income - expenses };
}

export type CashbookMonth = CashbookTotals & { month: string; label: string };

const MONTH_NAMES = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

export function cashbookMonths(year: number, movements: readonly CashbookMovement[]): CashbookMonth[] {
  return MONTH_NAMES.map((name, i) => {
    const month = `${year}-${String(i + 1).padStart(2, "0")}`;
    return { month, label: name, ...cashbookTotals(movements.filter((m) => m.date.startsWith(month))) };
  });
}

/** IVA contenuta in un importo "IVA inclusa" (scorporo), arrotondata al centesimo. */
export function vatInsideGross(grossEurCents: number, ratePercent: number): number {
  if (ratePercent <= 0) return 0;
  return grossEurCents - Math.round((grossEurCents * 100) / (100 + ratePercent));
}

export type TaxEstimate = {
  coefficientPercent: number;
  ratePercent: number;
  /** Incassato × coefficiente − contributi INPS pagati nell'anno. */
  taxableEurCents: number;
  /** Imposta sostitutiva stimata dell'anno. */
  taxEurCents: number;
  /** Contributi INPS segnati tra le spese dell'anno (si tolgono dal reddito). */
  socialSecurityPaidEurCents: number;
};

/**
 * Stima dell'imposta sostitutiva del forfettario (principio di cassa):
 * (incassato × coefficiente − contributi INPS pagati) × aliquota. Le altre
 * spese nel forfettario non contano per le tasse: le conta già il
 * coefficiente.
 */
export function estimateForfettarioTax(params: {
  incomeEurCents: number;
  socialSecurityPaidEurCents: number;
  coefficientPercent: number;
  ratePercent: number;
}): TaxEstimate {
  const gross = Math.max(0, params.incomeEurCents);
  const taxable = Math.max(0, Math.round((gross * params.coefficientPercent) / 100) - params.socialSecurityPaidEurCents);
  return {
    coefficientPercent: params.coefficientPercent,
    ratePercent: params.ratePercent,
    taxableEurCents: taxable,
    taxEurCents: Math.round((taxable * params.ratePercent) / 100),
    socialSecurityPaidEurCents: params.socialSecurityPaidEurCents,
  };
}

export function coefficientPercentOf(key: string): number | null {
  return FORFETTARIO_COEFFICIENTS.find((c) => c.key === key)?.percent ?? null;
}

/** A che punto è rispetto alla soglia del forfettario, solo da 70.000 € incassati. */
export function forfettarioThresholdLevel(incomeEurCents: number): "exit" | "over" | "near" | null {
  if (incomeEurCents > FORFETTARIO_EXIT_EUR_CENTS) return "exit";
  if (incomeEurCents > FORFETTARIO_LIMIT_EUR_CENTS) return "over";
  if (incomeEurCents >= FORFETTARIO_WARN_EUR_CENTS) return "near";
  return null;
}

/** Come lavora il professionista, per sapere cosa mostrare (stima, IVA). */
export type CashbookRegime =
  /** Partita IVA nel forfettario: stima dell'imposta possibile, niente IVA. */
  | "FORFETTARIO"
  /** Partita IVA con IVA (regime ordinario o semplificato): IVA separata, niente stima. */
  | "VAT"
  /** Lavoro occasionale: niente stima, niente IVA. */
  | "OCCASIONAL"
  /** Società o dati fiscali non ancora compilati. */
  | "OTHER";

export function cashbookRegimeOf(entityType: string | null | undefined, chargesVat: boolean | null | undefined): CashbookRegime {
  if (entityType === "PRIVATE_INDIVIDUAL") return "OCCASIONAL";
  if (entityType === "SOLE_PROPRIETOR") return chargesVat === false ? "FORFETTARIO" : chargesVat === true ? "VAT" : "OTHER";
  if (entityType === "BUSINESS") return "VAT";
  return "OTHER";
}

export type CashbookToCollect = {
  bookingId: string;
  /** Per aprire il lavoro in Richieste e lavori. */
  requestId: string | null;
  /** Giorno del lavoro terminato. */
  date: string;
  job: string;
  client: string;
  amountEurCents: number;
};

export type CashbookOverview = {
  year: number;
  regime: CashbookRegime;
  settings: CashbookSettings;
  months: CashbookMonth[];
  totals: CashbookTotals;
  movements: CashbookMovement[];
  /** Lavori terminati con soldi ancora da ricevere (oggi, non solo nell'anno). */
  toCollect: CashbookToCollect[];
  /** IVA dentro le entrate dell'anno, solo per chi la applica. */
  incomeVatEurCents: number | null;
  /** Solo per il forfettario e con la stima accesa. */
  taxEstimate: TaxEstimate | null;
  threshold: "exit" | "over" | "near" | null;
  /** Lavori fuori sito terminati senza prezzo: non entrano nei conti. */
  externalWithoutPrice: number;
};

// --- Foglio di calcolo dell'anno -----------------------------------------------

function csvEuro(cents: number | null): string {
  if (cents === null) return "";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

function dayIt(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Entrate e uscite dell'anno per il commercialista: una riga per movimento,
 * poi il riepilogo dei mesi. CSV col punto e virgola e le date all'italiana,
 * come lo apre Excel in italiano (e Numbers e Google Fogli).
 */
export function cashbookYearCsv(overview: Pick<CashbookOverview, "year" | "movements" | "months" | "totals">): string {
  const header = ["Data", "Entrata o uscita", "Tipo", "Dettaglio", "Importo", "Di cui IVA", "Documento"];
  const rows = overview.movements.map((m) =>
    [dayIt(m.date), isIncome(m.source) ? "Entrata" : "Uscita", m.label, m.detail, csvEuro(m.amountEurCents), csvEuro(m.vatEurCents), m.document].map(csvCell).join(";"),
  );
  const summary = [
    "",
    ["Mese", "Entrate", "Uscite", "Differenza"].join(";"),
    ...overview.months.map((mo) => [mo.label, csvEuro(mo.incomeEurCents), csvEuro(-mo.expensesEurCents), csvEuro(mo.leftEurCents)].map(csvCell).join(";")),
    [`Totale ${overview.year}`, csvEuro(overview.totals.incomeEurCents), csvEuro(-overview.totals.expensesEurCents), csvEuro(overview.totals.leftEurCents)].map(csvCell).join(";"),
  ];
  return `﻿${[header.join(";"), ...rows, ...summary].join("\r\n")}\r\n`;
}

// --- Excel gratuito (pagina pubblica) ------------------------------------------

export const freeSpreadsheetSignupSchema = z.object({
  email: z.string().trim().toLowerCase().email("Scrivi un'email valida.").max(200),
  /** Consenso facoltativo alle email con novità e consigli (GDPR art. 7). */
  marketingConsent: z.boolean().default(false),
  turnstileToken: z.string().max(2048).optional(),
});
export type FreeSpreadsheetSignupInput = z.infer<typeof freeSpreadsheetSignupSchema>;

/** Nome del file pubblicato in apps/web/public. */
export const FREE_SPREADSHEET_FILE = "entrate-e-uscite-professionisti.xlsx";

export const freeSpreadsheetConfirmSchema = z.object({ token: z.string().min(1).max(100) });
