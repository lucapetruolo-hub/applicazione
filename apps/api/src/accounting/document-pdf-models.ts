import {
  DAC7_QUARTER_LABEL,
  accountingDateLabel,
  accountingMonthLabel,
  dac7YearStatus,
  formatEurCents,
  platformInvoiceNote,
  platformInvoiceOriginalNote,
  platformInvoiceSubtitle,
  platformInvoiceTechnicalNotes,
  type CourtesyCopyView,
  type Dac7YearSummary,
  type MonthlyStatement,
  type PlatformInvoiceView,
} from "@professionisti/shared";
import type { PdfBlock, PdfDocumentModel, PdfRow } from "./document-pdf";

/**
 * Contenuto dei PDF (docs/CHANGELOG.md §374): le stesse parti e le stesse
 * parole delle pagine di "Fatture e documenti", senza i pulsanti e le
 * spiegazioni che servono solo sul sito.
 */

const eur = (cents: number) => formatEurCents(cents);

/** Una nostra fattura (o nota di credito) al professionista. */
export function invoicePdfModel(invoice: PlatformInvoiceView): PdfDocumentModel {
  const jobFees = invoice.source === "JOB_FEES";
  const percent = jobFees && !invoice.creditNote && invoice.onlinePaidEurCents ? (invoice.totalEurCents / invoice.onlinePaidEurCents) * 100 : null;
  const hasRecipientCode = invoice.recipient.lines.some((line) => line.startsWith("Codice destinatario") || line.startsWith("PEC"));

  const rows: PdfRow[] = [];
  let group: string | null = null;
  for (const line of invoice.lines) {
    if (line.group && line.group !== group) rows.push({ group: line.group });
    group = line.group ?? null;
    rows.push({ label: line.description, detail: line.detail, value: eur(line.taxableEurCents) });
  }

  const recoverable =
    invoice.vatRecoverable === false
      ? "Senza partita IVA, o nel regime forfettario, l'IVA è un costo: non si recupera."
      : invoice.vatRecoverable === true
        ? "L'IVA la recuperi nella tua dichiarazione IVA."
        : null;
  const noteLines = [
    recoverable,
    jobFees && invoice.periodMonth ? `Le stesse cifre le trovi, lavoro per lavoro, nell'estratto di ${accountingMonthLabel(invoice.periodMonth)}.` : null,
  ].filter((line): line is string => !!line);

  const blocks: PdfBlock[] = [
    {
      type: "highlight",
      label: invoice.creditNote ? "Totale restituito" : jobFees ? "Totale trattenuto" : "Totale pagato",
      value: eur(invoice.totalEurCents),
      badge: invoice.creditNote ? "Nota di credito" : jobFees ? "Già trattenuta" : "Già pagata",
      detail: `${percent !== null && invoice.onlinePaidEurCents ? `Su ${eur(invoice.onlinePaidEurCents)} pagati online dai clienti (${percent.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%). ` : ""}${platformInvoiceNote({ ...invoice, vatRecoverable: null })}`,
    },
    {
      type: "parties",
      parties: [
        { label: "Da", ...invoice.issuer },
        { label: "Per", ...invoice.recipient },
      ],
    },
    { type: "rows", rows },
    {
      type: "totals",
      rows: [
        { label: "Imponibile", value: eur(invoice.taxableEurCents) },
        { label: `IVA ${invoice.vatRatePercent}%`, value: eur(invoice.vatEurCents) },
        ...(invoice.roundingEurCents !== 0 ? [{ label: "Arrotondamento", value: eur(invoice.roundingEurCents) }] : []),
      ],
      total: { label: "Totale", value: eur(invoice.totalEurCents) },
    },
  ];
  if (noteLines.length > 0) blocks.push({ type: "note", tone: "green", lines: noteLines });
  blocks.push({ type: "text", muted: true, lines: [...platformInvoiceTechnicalNotes(invoice), platformInvoiceOriginalNote(hasRecipientCode)] });

  return { title: `${invoice.creditNote ? "Nota di credito" : "Fattura"} n. ${invoice.number}`, subtitle: platformInvoiceSubtitle(invoice), blocks };
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" }).replace(".", "");
}

/** L'estratto del mese, anche per il commercialista. */
export function statementPdfModel(statement: MonthlyStatement, who: string | null): PdfDocumentModel {
  const amount = (cents: number) => (cents === 0 ? "—" : eur(cents));
  const blocks: PdfBlock[] = [
    {
      type: "tiles",
      tiles: [
        { label: "Pagato online", value: eur(statement.totals.onlineEurCents) },
        { label: "Pagato a te", value: eur(statement.totals.directEurCents) },
        { label: "Trattenute", value: eur(statement.totals.feesEurCents) },
        { label: "Bonifici arrivati", value: eur(statement.totals.payoutsArrivedEurCents) },
      ],
    },
  ];
  if (statement.rows.length === 0) {
    blocks.push({ type: "text", muted: true, lines: ["Nessun movimento in questo mese."] });
  } else {
    blocks.push({
      type: "table",
      columns: [
        { label: "Data", width: 8 },
        { label: "Lavoro", width: 30 },
        { label: "Online", width: 12, align: "right" },
        { label: "Diretto", width: 12, align: "right" },
        { label: "Trattenute", width: 13, align: "right" },
        { label: "Bonifico", width: 25, align: "right" },
      ],
      rows: statement.rows.map((row) => ({
        cells: [shortDate(row.date), row.job, amount(row.onlineEurCents), amount(row.directEurCents), amount(row.feesEurCents), row.payoutEurCents !== null ? eur(row.payoutEurCents) : "—"],
        details: [null, row.client, null, null, null, row.payoutNote],
      })),
    });
  }
  if (statement.blockedEurCents > 0) {
    blocks.push({ type: "note", tone: "sand", lines: [`Ancora bloccati: ${eur(statement.blockedEurCents)}. Partono quando i clienti confermano i lavori.`] });
  }
  const invoiceLine = statement.feeInvoice
    ? `Le trattenute del mese sono nella fattura ${statement.feeInvoice.number}.`
    : statement.totals.feesEurCents !== 0
      ? "La fattura delle trattenute arriva il 1° del mese dopo."
      : null;
  blocks.push({ type: "note", tone: "green", lines: [invoiceLine, statement.documentHint].filter((line): line is string => !!line) });

  return {
    title: `Estratto di ${statement.monthLabel}`,
    subtitle: `${who ? `${who}. ` : ""}Quanto ti hanno pagato i clienti, quanto abbiamo trattenuto e i bonifici.`,
    blocks,
  };
}

/** Copia di cortesia della fattura, o ricevuta per prestazione occasionale, da dare al cliente. */
export function courtesyPdfModel(copy: CourtesyCopyView): PdfDocumentModel {
  const receipt = copy.kind === "RECEIPT";
  const total = copy.totalEurCents !== null ? eur(copy.totalEurCents) : "______";
  const blocks: PdfBlock[] = [
    {
      type: "meta",
      items: [
        { label: "Numero", value: copy.number ?? "______" },
        { label: "Data", value: accountingDateLabel(copy.date) },
      ],
    },
    {
      type: "parties",
      parties: [
        { label: "Da", ...copy.issuer },
        { label: receipt ? "Ricevuto da" : "Per", ...copy.customer },
      ],
    },
  ];
  if (copy.vat && copy.totalEurCents !== null) {
    blocks.push({ type: "rows", rows: [{ label: copy.description, value: eur(copy.vat.taxableEurCents) }] });
    blocks.push({
      type: "totals",
      rows: [
        { label: "Imponibile", value: eur(copy.vat.taxableEurCents) },
        { label: `IVA ${copy.vat.ratePercent}%`, value: eur(copy.vat.vatEurCents) },
      ],
      total: { label: "Totale", value: total, detail: copy.paidHow },
    });
  } else {
    blocks.push({ type: "rows", rows: [{ label: copy.description, value: total }] });
    blocks.push({ type: "totals", rows: [], total: { label: "Totale", value: total, detail: copy.paidHow } });
  }
  if (copy.notes.length > 0) blocks.push({ type: "text", muted: true, lines: copy.notes });
  if (receipt) blocks.push({ type: "signature", label: "Firma" });
  else blocks.push({ type: "text", muted: true, lines: ["Copia di cortesia: il documento valido è la fattura elettronica inviata all'Agenzia delle Entrate."] });

  return { title: receipt ? "Ricevuta per prestazione occasionale" : "Copia di cortesia della fattura", blocks };
}

/** Riepilogo DAC7 di un anno: quello che comunichiamo al fisco. */
export function dac7PdfModel(summary: Dac7YearSummary, maskedIban: string | null, who: string | null, now: Date = new Date()): PdfDocumentModel {
  const status = dac7YearStatus(summary, now);
  const hasOnline = summary.quarters.some((q) => q.onlineEurCents > 0);
  const blocks: PdfBlock[] = [
    { type: "highlight", label: `Compensi ${summary.year}`, value: eur(summary.totalEurCents), badge: status.label, detail: status.detail },
    {
      type: "table",
      columns: [
        { label: "Trimestre", width: 22 },
        { label: "Pagati direttamente", width: 22, align: "right" },
        { label: "Pagati online", width: 20, align: "right" },
        { label: "Trattenute (con IVA)", width: 22, align: "right" },
        { label: "Lavori", width: 10, align: "right" },
      ],
      rows: ([1, 2, 3, 4] as const).map((q) => {
        const quarter = summary.quarters.find((item) => item.quarter === q);
        const empty = !quarter || quarter.jobs === 0;
        return {
          cells: empty
            ? [`${q}° trimestre`, "—", "—", "—", "0"]
            : [`${q}° trimestre`, eur(quarter.directEurCents), eur(quarter.onlineEurCents), quarter.feesEurCents > 0 ? eur(quarter.feesEurCents) : "—", String(quarter.jobs)],
          details: [DAC7_QUARTER_LABEL[q], null, null, null, null],
        };
      }),
    },
  ];
  if (hasOnline) blocks.push({ type: "text", lines: [maskedIban ? `Conto dei pagamenti online: ${maskedIban}` : "Manca l'IBAN dei pagamenti online: aggiungilo in Dati fiscali e pagamenti."] });
  blocks.push({
    type: "text",
    muted: true,
    lines: [
      "Lo chiede la direttiva europea DAC7: entro il 31 gennaio comunichiamo i compensi dell'anno prima, insieme ai tuoi dati fiscali.",
      "Gli importi sono quelli che indichi a \"Lavoro terminato\". Quelli online sono al netto della nostra trattenuta (con l'IVA), che comunichiamo a parte.",
    ],
  });
  return { title: "Riepilogo annuale dei compensi (DAC7)", subtitle: `${who ? `${who}. ` : ""}Compensi ${summary.year}.`, blocks };
}

/** Nome del file: "fattura-COM-2026-0017.pdf", "estratto-2026-09.pdf". */
export function pdfFileName(base: string): string {
  return `${base.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}
