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
  statementFeeInvoiceNote,
  statementOnlineNote,
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
        details: [null, row.client, row.refundsEurCents > 0 ? `Rimborso −${eur(row.refundsEurCents)}` : null, null, null, row.payoutNote],
      })),
    });
  }
  const onlineNote = statementOnlineNote(statement);
  if (onlineNote) blocks.push({ type: "text", muted: true, lines: [onlineNote] });
  if (statement.blockedEurCents > 0) {
    blocks.push({ type: "note", tone: "sand", lines: [`Ancora bloccati: ${eur(statement.blockedEurCents)}. Partono quando i clienti confermano i lavori.`] });
  }
  const invoiceLine = statementFeeInvoiceNote(statement);
  blocks.push({ type: "note", tone: "green", lines: [invoiceLine, statement.documentHint].filter((line): line is string => !!line) });

  return {
    title: `Estratto di ${statement.monthLabel}`,
    subtitle: `${who ? `${who}. ` : ""}Quanto ti hanno pagato i clienti, quanto abbiamo trattenuto e i bonifici.`,
    blocks,
  };
}

/** Ricevuta per prestazione occasionale da dare al cliente (docs/changelog/2026-10-30-documenti-snelli.md). */
export function courtesyPdfModel(copy: CourtesyCopyView, audience: "professional" | "client" = "professional"): PdfDocumentModel {
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
        { label: "Ricevuto da", ...copy.customer },
      ],
    },
  ];
  const lineValue = (cents: number) => (copy.totalEurCents !== null ? eur(cents) : "______");
  blocks.push({ type: "rows", rows: copy.lines.map((line) => ({ label: line.description, value: lineValue(line.amountEurCents) })) });
  const withholding = copy.withholding?.applies ? copy.withholding : null;
  if (withholding) {
    // Ricevuta a una partita IVA con la ritenuta (collaudo C-04): lordo, ritenuta e netto.
    blocks.push({
      type: "totals",
      rows: [
        { label: "Compenso lordo", value: total },
        { label: "Ritenuta d'acconto 20%", value: `−${eur(withholding.amountEurCents)}` },
      ],
      total: { label: "Netto pagato", value: eur(withholding.netEurCents), detail: copy.paidHow },
    });
  } else {
    blocks.push({ type: "totals", rows: [], total: { label: "Totale", value: total, detail: copy.paidHow } });
  }
  if (copy.notes.length > 0) blocks.push({ type: "text", muted: true, lines: copy.notes });
  // Al cliente (§386) la ricevuta è una copia: l'originale firmato glielo dà il professionista.
  if (audience === "client") blocks.push({ type: "text", muted: true, lines: ["Copia: la ricevuta originale firmata, con la marca da bollo quando serve, te la dà il professionista."] });
  else blocks.push({ type: "signature", label: "Firma" });

  return {
    title: audience === "client" ? "Copia della ricevuta per prestazione occasionale" : "Ricevuta per prestazione occasionale",
    blocks,
    // Lo emette il professionista: in alto il suo nome, non il sito (G-11).
    issuedBy: copy.issuer.name || null,
  };
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
  if (hasOnline) blocks.push({ type: "text", lines: [maskedIban ? `Conto dei pagamenti online: ${maskedIban}` : "Manca l'IBAN dei pagamenti online: aggiungilo in Fisco e pagamenti, scheda Pagamenti online."] });
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
 * Riepilogo dell'anno delle ricevute, per il commercialista
 * (docs/CHANGELOG.md §382): il totale va nella dichiarazione dei redditi.
 */
export function courtesyYearPdfModel(summary: CourtesyYearSummary, now: Date = new Date()): PdfDocumentModel {
  const receipts = courtesyYearPart(summary.receipts);
  const blocks: PdfBlock[] = [
    {
      type: "tiles",
      tiles: [
        { label: "Ricevute", value: eur(receipts.totalEurCents) },
        { label: "Documenti", value: String(summary.receipts.length) },
      ],
    },
  ];
  // Prima le cose da sistemare: una ricevuta da rifare o senza importo.
  const missing = receipts.missingAmounts;
  const changed = receipts.amountChanged;
  const warnings = [
    changed > 0
      ? `${changed === 1 ? "1 documento ha" : `${changed} documenti hanno`} l'importo cambiato dopo il PDF dato al cliente (per esempio un rimborso): nella tabella c'è l'importo del documento e, sotto, quello di oggi.`
      : null,
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
        row.paidAt && accountingShortDate(row.paidAt) !== accountingShortDate(row.date) ? `pagato il ${accountingShortDate(row.paidAt)}` : null,
        [row.customerTaxId, row.customerHasVatNumber && !row.customerTaxId ? "Con partita IVA" : null].filter(Boolean).join(" · ") || null,
        row.amountChanged ? `Oggi ${row.currentEurCents !== null ? eur(row.currentEurCents) : "senza importo"}: serve un nuovo documento` : null,
        row.withholdingEurCents ? `ritenuta ${eur(row.withholdingEurCents)}` : row.stampDuty ? "Bollo da 2 €" : null,
      ],
    })),
  });

  if (summary.receipts.length > 0) {
    const lines = [
      "Il totale delle ricevute va nella dichiarazione dei redditi: sono i compensi delle prestazioni occasionali dell'anno.",
      receipts.withholdingEurCents > 0
        ? `Ritenute d'acconto trattenute dai clienti con partita IVA: ${eur(receipts.withholdingEurCents)}. Le versano loro per te e a inizio anno ti mandano la Certificazione Unica.`
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
  blocks.push({
    type: "text",
    muted: true,
    lines: [
      `Preparato il ${accountingDateLabel(now.toISOString())} con le ricevute fatte sul sito per i lavori terminati. Gli importi sono quelli delle ricevute date ai clienti.`,
      "Non è un documento fiscale: valgono le ricevute firmate che hai dato ai clienti.",
    ],
  });
  return {
    title: `Ricevute del ${summary.year}`,
    subtitle: `${summary.who ? `${summary.who}. ` : ""}Ricevute per prestazione occasionale, da dare al commercialista.`,
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
  return `ricevuta-${copy.number ?? ""}`;
}

export function pdfFileName(base: string): string {
  return `${base.replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}.pdf`;
}
