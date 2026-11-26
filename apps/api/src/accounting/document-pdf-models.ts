import {
  DAC7_QUARTER_LABEL,
  INVOICE_SOURCE_LABEL,
  STAMP_DUTY_THRESHOLD_EUR_CENTS,
  accountingDateLabel,
  accountingMonthLabel,
  courtesyYearPart,
  dac7YearStatus,
  platformInvoiceVatNote,
  formatEurCents,
  OCCASIONAL_INPS_THRESHOLD_EUR_CENTS,
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
  customerTaxIdKind,
} from "@professionisti/shared";
import type { PdfBlock, PdfDocumentModel } from "./document-pdf";

/**
 * Contenuto dei PDF (docs/CHANGELOG.md §379): le stesse parti e le stesse
 * parole delle pagine di "Fatture e documenti", senza i pulsanti e le
 * spiegazioni che servono solo sul sito.
 */

const eur = (cents: number) => formatEurCents(cents);

/**
 * Una nostra fattura (o nota di credito) al professionista. Dal 26/11/2026
 * (docs/changelog/2026-11-26-pdf-puliti.md) come le fatture di Claude Max:
 * dati in colonna, cifra in una frase, tabella con l'IVA, totali a destra e
 * sezione "Pagamento".
 */
export function invoicePdfModel(invoice: PlatformInvoiceView): PdfDocumentModel {
  const jobFees = invoice.source === "JOB_FEES";
  const total = eur(invoice.totalEurCents);
  const date = accountingDateLabel(invoice.issuedAt);
  const month = invoice.periodMonth ? accountingMonthLabel(invoice.periodMonth) : null;
  const percent = jobFees && !invoice.creditNote && invoice.onlinePaidEurCents ? (invoice.totalEurCents / invoice.onlinePaidEurCents) * 100 : null;
  const hasRecipientCode = invoice.recipient.lines.some((line) => line.startsWith("Codice destinatario") || line.startsWith("PEC"));

  const sentence = invoice.creditNote
    ? jobFees
      ? `${total} di trattenute restituite`
      : `${total} rimborsati sulla carta`
    : jobFees
      ? `${total} già trattenuti dai pagamenti online`
      : `${total} pagati il ${date}`;
  const detail = invoice.creditNote
    ? platformInvoiceNote({ ...invoice, vatRecoverable: null })
    : jobFees
      ? `${percent !== null && invoice.onlinePaidEurCents ? `Su ${eur(invoice.onlinePaidEurCents)} pagati online dai clienti (${percent.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%). ` : ""}Non devi pagare nulla.`
      : null;

  const tableRows: ({ cells: string[]; details?: (string | null)[] } | { group: string })[] = [];
  let group: string | null = null;
  for (const line of invoice.lines) {
    if (line.group && line.group !== group) tableRows.push({ group: line.group });
    group = line.group ?? null;
    tableRows.push({ cells: [line.description, `${invoice.vatRatePercent}%`, eur(line.taxableEurCents)], details: [line.detail ?? null, null, null] });
  }

  const blocks: PdfBlock[] = [
    {
      type: "meta",
      items: [
        { label: "Numero", value: invoice.number },
        { label: "Data di emissione", value: date },
        ...(jobFees && month ? [{ label: "Mese", value: month }] : []),
        ...(invoice.relatedNumber ? [{ label: "Riferita alla fattura", value: invoice.relatedNumber }] : []),
        ...(!jobFees && !invoice.creditNote ? [{ label: "Pagata il", value: date }] : []),
      ],
    },
    {
      type: "parties",
      parties: [
        { label: "Da", ...invoice.issuer },
        { label: "Intestata a", ...invoice.recipient },
      ],
    },
    { type: "amount", text: sentence, detail },
    {
      type: "table",
      columns: [
        { label: "Descrizione", width: 64 },
        { label: "IVA", width: 12, align: "right" },
        { label: "Importo", width: 24, align: "right" },
      ],
      rows: tableRows,
    },
    {
      type: "totals",
      rows: [
        { label: "Imponibile", value: eur(invoice.taxableEurCents) },
        { label: `IVA ${invoice.vatRatePercent}% su ${eur(invoice.taxableEurCents)}`, value: eur(invoice.vatEurCents) },
        ...(invoice.roundingEurCents !== 0 ? [{ label: "Arrotondamento", value: eur(invoice.roundingEurCents) }] : []),
      ],
      total: { label: invoice.creditNote ? "Totale restituito" : jobFees ? "Totale trattenuto" : "Totale pagato", value: total },
    },
  ];
  if (!invoice.creditNote) {
    blocks.push(
      { type: "heading", text: "Pagamento" },
      {
        type: "table",
        columns: [
          { label: "Metodo", width: 44 },
          { label: "Data", width: 30 },
          { label: "Importo", width: 26, align: "right" },
        ],
        rows: [{ cells: [jobFees ? "Trattenuto dai pagamenti online" : "Carta", date, total] }],
      },
    );
  }
  // Mancata consegna (docs/changelog/2026-11-24-scadenze-fiscali-attivita.md): la fattura è emessa, va detto dove trovarla.
  if (invoice.sdiUndelivered) {
    blocks.push({
      type: "note",
      tone: "sand",
      lines: ["Il fisco non è riuscito a consegnare la fattura elettronica al tuo codice destinatario o alla tua PEC: l'originale lo trovi nel tuo cassetto fiscale, in Fatture e corrispettivi. Questo PDF è una copia di cortesia."],
    });
  }
  const recoverable = platformInvoiceVatNote(invoice);
  blocks.push({
    type: "text",
    muted: true,
    lines: [
      ...(recoverable ? [recoverable] : []),
      ...(jobFees && month ? [`Le stesse cifre le trovi, lavoro per lavoro, nell'estratto di ${month}.`] : []),
      ...platformInvoiceTechnicalNotes(invoice),
      `Copia di cortesia in PDF. ${platformInvoiceOriginalNote(hasRecipientCode)}`,
    ],
  });

  const kind = invoice.creditNote ? "Nota di credito" : "Fattura";
  return {
    title: kind,
    // La data è già tra i dati in colonna: sotto il titolo solo di cosa è.
    subtitle: jobFees ? platformInvoiceSubtitle(invoice) : `${invoice.creditNote ? "Rimborso: " : ""}${invoice.creditNote ? INVOICE_SOURCE_LABEL[invoice.source].toLowerCase() : INVOICE_SOURCE_LABEL[invoice.source]}.`,
    blocks,
    footer: `${kind} ${invoice.number} · ${total} · Copia di cortesia`,
  };
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
        { label: "Trattenute (con IVA)", value: eur(statement.totals.feesEurCents) },
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
  const withholding = copy.withholding?.applies ? copy.withholding : null;
  const date = accountingDateLabel(copy.date);
  const blocks: PdfBlock[] = [
    {
      type: "meta",
      items: [
        { label: "Numero", value: copy.number ?? "______" },
        { label: "Data", value: date },
      ],
    },
    {
      type: "parties",
      parties: [
        { label: "Da", ...copy.issuer },
        { label: "Cliente", ...copy.customer },
      ],
    },
  ];
  // La cifra in una frase (docs/changelog/2026-11-26-pdf-puliti.md): con la ritenuta è il netto che il professionista riceve.
  if (copy.totalEurCents !== null) {
    blocks.push({ type: "amount", text: `${withholding ? eur(withholding.netEurCents) : total} ricevuti il ${date}`, detail: copy.paidHow });
  }
  const lineValue = (cents: number) => (copy.totalEurCents !== null ? eur(cents) : "______");
  blocks.push({
    type: "table",
    columns: [
      { label: "Descrizione", width: 70 },
      { label: "Importo", width: 30, align: "right" },
    ],
    rows: copy.lines.map((line) => ({ cells: [line.description, lineValue(line.amountEurCents)] })),
  });
  if (withholding) {
    // Ricevuta a una partita IVA con la ritenuta (collaudo C-04): lordo, ritenuta e netto.
    blocks.push({
      type: "totals",
      rows: [
        { label: "Compenso lordo", value: total },
        { label: "Ritenuta d'acconto 20% (art. 25 DPR 600/1973)", value: `−${eur(withholding.amountEurCents)}` },
      ],
      total: { label: "Netto pagato", value: eur(withholding.netEurCents) },
    });
  } else {
    blocks.push({ type: "totals", rows: [], total: { label: "Totale", value: total } });
  }
  if (copy.notes.length > 0) blocks.push({ type: "text", muted: true, lines: copy.notes });
  // Al cliente (§386) la ricevuta è una copia: l'originale firmato glielo dà il professionista.
  if (audience === "client") blocks.push({ type: "text", muted: true, lines: ["Copia: la ricevuta originale firmata, con la marca da bollo quando serve, te la dà il professionista."] });
  // Oltre 77,47 € il riquadro dove incollare la marca da bollo, accanto alla firma (decisione di Luca del 26/11/2026).
  else blocks.push({ type: "signature", label: "Firma", stamp: copy.totalEurCents !== null && copy.totalEurCents > STAMP_DUTY_THRESHOLD_EUR_CENTS });

  return {
    title: audience === "client" ? "Copia della ricevuta" : "Ricevuta",
    subtitle: "Prestazione occasionale",
    blocks,
    // Lo emette il professionista: in alto il suo nome, non il sito (G-11).
    issuedBy: copy.issuer.name || null,
    footer: `Ricevuta ${copy.number ?? "senza numero"} · ${total}`,
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
            : [`${q}° trimestre`, amountOrDash(quarter.directEurCents), amountOrDash(quarter.onlineEurCents), amountOrDash(quarter.feesEurCents), String(quarter.jobs)],
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
        // Con il tipo del codice davanti (commercialista, 25/11/2026).
        row.customerTaxId
          ? `${customerTaxIdKind(row.customerTaxId, row.customerHasVatNumber) === "Partita IVA" ? "P.IVA" : "C.F."} ${row.customerTaxId}`
          : row.customerHasVatNumber
            ? "Con partita IVA"
            : null,
        row.amountChanged ? `Oggi ${row.currentEurCents !== null ? eur(row.currentEurCents) : "senza importo"}: serve un nuovo documento` : null,
        // Una ricevuta a una partita IVA sopra 77,47 € ha sia la ritenuta sia il bollo.
        [row.withholdingEurCents ? `ritenuta ${eur(row.withholdingEurCents)}` : null, row.stampDuty ? "bollo 2 €" : null].filter(Boolean).join(" · ") || null,
      ],
    })),
  });

  if (summary.receipts.length > 0) {
    const lines = [
      "Il totale delle ricevute (compensi lordi, prima della ritenuta) va nella dichiarazione dei redditi: sono redditi diversi da prestazioni occasionali.",
      receipts.withholdingEurCents > 0
        ? `Ritenute d'acconto trattenute dai clienti con partita IVA: ${eur(receipts.withholdingEurCents)}. Le versano loro per te e a inizio anno ti mandano la Certificazione Unica.`
        : null,
      receipts.totalEurCents > OCCASIONAL_INPS_THRESHOLD_EUR_CENTS
        ? `Nel ${summary.year} le ricevute superano 5.000 €: sulla parte in più si pagano i contributi INPS (Gestione Separata). Il limite conta anche il lavoro occasionale fatto fuori dal sito: parlane con il tuo commercialista.`
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

/** Un importo, o il trattino quando è zero (riepilogo DAC7). */
function amountOrDash(cents: number): string {
  return cents === 0 ? "—" : eur(cents);
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
