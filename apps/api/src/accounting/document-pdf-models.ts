import {
  DAC7_QUARTER_LABEL,
  accountingDateLabel,
  accountingMonthLabel,
  courtesyYearPart,
  dac7YearStatus,
  formatEurCents,
  platformInvoiceNote,
  platformInvoiceOriginalNote,
  platformInvoiceSubtitle,
  platformInvoiceTechnicalNotes,
  type CourtesyCopyView,
  type CourtesyYearRow,
  type CourtesyYearSummary,
  type Dac7YearSummary,
  type MonthlyStatement,
  type PlatformInvoiceView,
} from "@professionisti/shared";
import type { PdfBlock, PdfDocumentModel, PdfRow } from "./document-pdf";

/**
 * Contenuto dei PDF (docs/CHANGELOG.md §379): le stesse parti e le stesse
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

/**
 * Riepilogo dell'anno dei documenti dati ai clienti, per il commercialista
 * (docs/CHANGELOG.md §382): il totale delle ricevute va nella dichiarazione
 * dei redditi; le copie delle fatture servono solo a controllare.
 */
export function courtesyYearPdfModel(summary: CourtesyYearSummary, now: Date = new Date()): PdfDocumentModel {
  const receipts = courtesyYearPart(summary.receipts);
  const invoices = courtesyYearPart(summary.invoices);
  const count = summary.receipts.length + summary.invoices.length;
  const blocks: PdfBlock[] = [
    {
      type: "tiles",
      tiles: [
        ...(summary.receipts.length > 0 ? [{ label: "Ricevute", value: eur(receipts.totalEurCents) }] : []),
        ...(summary.invoices.length > 0 ? [{ label: "Fatture", value: eur(invoices.totalEurCents) }] : []),
        { label: "Documenti", value: String(count) },
      ],
    },
  ];
  // Prima le cose da sistemare: un documento da rifare o senza importo.
  const missing = receipts.missingAmounts + invoices.missingAmounts;
  const changed = receipts.amountChanged + invoices.amountChanged;
  const warnings = [
    changed > 0 ? `${changed === 1 ? "1 documento ha" : `${changed} documenti hanno`} l'importo cambiato dopo il PDF: ${changed === 1 ? "scaricalo di nuovo e dallo al cliente al posto di quello vecchio" : "scaricali di nuovo e dalli ai clienti al posto di quelli vecchi"}.` : null,
    missing > 0 ? `${missing === 1 ? "1 documento è" : `${missing} documenti sono`} senza importo: il lavoro non ha ancora il prezzo finale.` : null,
  ].filter((line): line is string => !!line);
  if (warnings.length > 0) blocks.push({ type: "note", tone: "sand", lines: warnings });

  const tableOf = (rows: CourtesyYearRow[]): PdfBlock => ({
    type: "table",
    columns: [
      { label: "Numero", width: 13 },
      { label: "Data", width: 13 },
      { label: "Cliente", width: 30 },
      { label: "Lavoro", width: 24 },
      { label: "Importo", width: 20, align: "right" },
    ],
    rows: rows.map((row) => ({
      cells: [row.number ?? "—", accountingShortDate(row.date), row.customerName ?? "—", row.jobLabel ?? "Lavoro", row.totalEurCents !== null ? eur(row.totalEurCents) : "—"],
      details: [
        null,
        null,
        row.customerHasVatNumber ? "Con partita IVA" : null,
        row.amountChanged ? "Importo cambiato dopo il PDF" : null,
        row.vatEurCents !== null ? `di cui IVA ${eur(row.vatEurCents)}` : row.stampDuty ? "Bollo da 2 €" : null,
      ],
    })),
  });

  if (summary.receipts.length > 0) {
    const lines = [
      "Il totale delle ricevute va nella dichiarazione dei redditi: sono i compensi delle prestazioni occasionali dell'anno.",
      receipts.withVatNumber > 0
        ? `${receipts.withVatNumber === 1 ? "1 ricevuta è a un cliente" : `${receipts.withVatNumber} ricevute sono a clienti`} con partita IVA: di solito trattengono il 20% di ritenuta d'acconto e la versano per te.`
        : null,
      receipts.stampDuty > 0 ? `${receipts.stampDuty === 1 ? "1 ricevuta supera" : `${receipts.stampDuty} ricevute superano`} 77,47 €: sull'originale va la marca da bollo da 2 €.` : null,
    ].filter((line): line is string => !!line);
    blocks.push(
      { type: "heading", text: "Ricevute per prestazione occasionale" },
      tableOf(summary.receipts),
      { type: "totals", rows: [], total: { label: "Totale ricevute", value: eur(receipts.totalEurCents) } },
      { type: "note", tone: "green", lines },
    );
  }
  if (summary.invoices.length > 0) {
    blocks.push(
      { type: "heading", text: "Copie delle fatture" },
      tableOf(summary.invoices),
      {
        type: "totals",
        rows: invoices.vatEurCents > 0 ? [{ label: "di cui IVA", value: eur(invoices.vatEurCents) }] : [],
        total: { label: "Totale fatture", value: eur(invoices.totalEurCents) },
      },
      { type: "note", tone: "green", lines: ["Le fatture valide sono quelle del tuo programma di fatturazione: questo elenco serve a controllare che ci siano tutte."] },
    );
  }
  blocks.push({
    type: "text",
    muted: true,
    lines: [
      `Preparato il ${accountingDateLabel(now.toISOString())} con i documenti fatti sul sito. Gli importi sono quelli di oggi, dopo eventuali rimborsi; restano fuori i lavori annullati.`,
      "Non è un documento fiscale: valgono le ricevute e le fatture che hai dato ai clienti.",
    ],
  });
  return {
    title: `Documenti dati ai clienti nel ${summary.year}`,
    subtitle: `${summary.who ? `${summary.who}. ` : ""}Ricevute e copie delle fatture, da dare al commercialista.`,
    blocks,
  };
}

/** "27/10/2026", in ora italiana. */
function accountingShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Rome" });
}

/** Nome del file: "fattura-COM-2026-0017.pdf", "estratto-2026-09.pdf". */
/** Nome del file della copia di cortesia: "ricevuta-4-2026", "fattura-cortesia-12-A". */
export function courtesyPdfBaseName(copy: CourtesyCopyView): string {
  return copy.kind === "RECEIPT" ? `ricevuta-${copy.number ?? ""}` : `fattura-cortesia-${copy.number ?? copy.date.slice(0, 10)}`;
}

export function pdfFileName(base: string): string {
  return `${base.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}
