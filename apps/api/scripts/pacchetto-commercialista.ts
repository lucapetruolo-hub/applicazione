/**
 * Pacchetto per il commercialista: un PDF per ogni documento contabile del
 * sito e l'XML delle nostre fatture elettroniche, con dati inventati
 * (docs/changelog/2026-11-02-collaudo-abbonamento.md). Uso:
 * `pnpm --filter @professionisti/api exec tsx scripts/pacchetto-commercialista.ts [cartella]`
 * (default `pacchetto-commercialista/`). Non tocca il database né manda nulla.
 * Dal 25/11/2026 anche il preventivo (13) e il riepilogo pagamenti del cliente (14).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CourtesyYearSummary, MonthlyStatement, PlatformInvoiceLine, PlatformInvoiceView } from "@professionisti/shared";
import { renderDocumentPdf, type PdfDocumentModel } from "../src/accounting/document-pdf";
import { courtesyPdfModel, courtesyYearPdfModel, dac7PdfModel, invoicePdfModel, statementPdfModel } from "../src/accounting/document-pdf-models";
import { QuotePdfService } from "../src/accounting/quote-pdf.service";
import { buildFatturaPaXml, fatturaPaFileName } from "../src/accounting/invoice-xml";
import { fatturaPaCustomer, fatturaPaIssuer, invoiceTotals, issuerParty, recipientParty, sdiProgressive, xmlLineDescription, type IssuerSnapshot, type RecipientSnapshot } from "../src/accounting/invoice-documents";

const out = process.argv[2] ?? "pacchetto-commercialista";
mkdirSync(out, { recursive: true });

// Dati di esempio: né la società né il professionista esistono.
const issuer: IssuerSnapshot = {
  companyName: "Professionisti S.r.l. (DATI DI ESEMPIO)",
  vatNumber: "12345678903",
  taxCode: null,
  street: "Via Esempio",
  houseNumber: "1",
  postalCode: "20121",
  city: "Milano",
  province: "MI",
  country: "IT",
  taxRegime: "RF01",
  reaOffice: "MI",
  reaNumber: "1234567",
  shareCapital: "10.000,00",
  pecEmail: "esempio@pec.it",
};

const professional: RecipientSnapshot = {
  entityType: "SOLE_PROPRIETOR",
  companyName: null,
  firstName: "Mario",
  lastName: "Rossi",
  vatNumber: "01234567897",
  taxCode: "RSSMRA80A01H501U",
  street: "Via Roma",
  houseNumber: "10",
  postalCode: "00184",
  city: "Roma",
  province: "RM",
  country: "IT",
  sdiRecipientCode: "ABC1234",
  pecEmail: null,
  chargesVat: true,
};

const issuerPdf = issuerParty(issuer);
const recipientPdf = recipientParty(professional);

type Invoice = { file: string; view: PlatformInvoiceView; xmlType: "TD01" | "TD04" | "TD24"; payment: "MP08" | "MP22"; causale: string[]; related: { number: string; date: string } | null };

function invoice(file: string, base: Omit<PlatformInvoiceView, "issuer" | "recipient" | "taxableEurCents" | "vatEurCents" | "roundingEurCents" | "vatRatePercent" | "sdiStatus" | "id">, extra: Omit<Invoice, "file" | "view">): Invoice {
  const totals = invoiceTotals(base.lines, base.totalEurCents);
  return { file, view: { ...base, ...totals, id: file, sdiStatus: "SENT", vatRatePercent: 22, issuer: issuerPdf, recipient: recipientPdf }, ...extra };
}

// Ottobre 2026: tre pagamenti online (7% + IVA ciascuno, arrotondato al centesimo sul lordo).
const octoberLines: PlatformInvoiceLine[] = [
  { description: "Trattenuta sull'acconto", detail: "su 40,00 € pagati online", group: "Idraulico, perdita sotto il lavello (Anna B.)", taxableEurCents: 280 },
  { description: "Trattenuta sul saldo", detail: "su 160,00 € pagati online", group: "Idraulico, perdita sotto il lavello (Anna B.)", taxableEurCents: 1120 },
  { description: "Trattenuta sul pagamento", detail: "su 300,00 € pagati online", group: "Idraulico, sostituzione rubinetti (Luca V.)", taxableEurCents: 2100 },
];

const invoices: Invoice[] = [
  invoice(
    "01-fattura-trattenute-del-mese-COM",
    { number: "COM/2026/0001", source: "JOB_FEES", creditNote: false, periodMonth: "2026-10", issuedAt: "2026-10-31T12:00:00Z", totalEurCents: 342 + 1366 + 2562, lines: octoberLines, relatedNumber: null, vatRecoverable: true, onlinePaidEurCents: 50000 },
    { xmlType: "TD24", payment: "MP22", related: null, causale: ["Trattenute del servizio sui pagamenti online di ottobre 2026, già trattenute dalle somme incassate."] },
  ),
  invoice(
    "02-nota-di-credito-trattenute-COM",
    { number: "COM/2026/0002", source: "JOB_FEES", creditNote: true, periodMonth: "2026-11", issuedAt: "2026-11-30T12:00:00Z", totalEurCents: 342, lines: [{ description: "Trattenuta restituita: acconto rimborsato al cliente", detail: "su 40,00 € rimborsati", group: "Idraulico, perdita sotto il lavello (Anna B.)", taxableEurCents: 280 }], relatedNumber: "COM/2026/0001", vatRecoverable: true, onlinePaidEurCents: 0 },
    { xmlType: "TD04", payment: "MP22", related: { number: "COM/2026/0001", date: "2026-10-31" }, causale: ["Nota di credito: trattenuta restituita per un rimborso al cliente."] },
  ),
  invoice(
    "03-fattura-abbonamento-ABB",
    { number: "ABB/2026/0001", source: "SUBSCRIPTION", creditNote: false, periodMonth: null, issuedAt: "2026-11-15T09:30:00Z", totalEurCents: 7198, lines: [{ description: "Abbonamento Plus, mensile", detail: "dal 15/11/2026 al 14/12/2026", taxableEurCents: 5900 }], relatedNumber: null, vatRecoverable: true, onlinePaidEurCents: null },
    { xmlType: "TD01", payment: "MP08", related: null, causale: ["Abbonamento mensile al servizio, pagato con carta."] },
  ),
  // Passaggio a un livello superiore (decisione di Luca del 25/11/2026,
  // docs/changelog/2026-11-25-passaggio-di-livello.md): prezzo intero del nuovo
  // livello e mese nuovo da quel giorno, quindi una normale fattura dell'abbonamento.
  invoice(
    "04-fattura-passaggio-a-pro-ABB",
    { number: "ABB/2026/0002", source: "SUBSCRIPTION", creditNote: false, periodMonth: null, issuedAt: "2026-11-20T16:10:00Z", totalEurCents: 12078, lines: [{ description: "Abbonamento Pro mensile", detail: "dal 20/11/2026 al 19/12/2026", taxableEurCents: 9900 }], relatedNumber: null, vatRecoverable: true, onlinePaidEurCents: null },
    { xmlType: "TD01", payment: "MP08", related: null, causale: ["Abbonamento mensile al servizio (passaggio al livello Pro), pagato con carta."] },
  ),
  // Rimborso dell'abbonamento dalla Dashboard di Stripe: nota di credito della serie ABB
  // collegata alla fattura del pagamento (collaudo dell'08/11/2026, E5-06; domanda N8).
  invoice(
    "05-nota-di-credito-abbonamento-ABB",
    { number: "ABB/2026/0003", source: "SUBSCRIPTION", creditNote: true, periodMonth: null, issuedAt: "2026-11-22T11:00:00Z", totalEurCents: 7198, lines: [{ description: "Abbonamento Plus, mensile", detail: "dal 15/11/2026 al 14/12/2026", taxableEurCents: 5900 }], relatedNumber: "ABB/2026/0001", vatRecoverable: true, onlinePaidEurCents: null },
    { xmlType: "TD04", payment: "MP08", related: { number: "ABB/2026/0001", date: "2026-11-15" }, causale: ["Rimborso: abbonamento, restituito sulla carta."] },
  ),
];

const statement: MonthlyStatement = {
  month: "2026-10",
  monthLabel: "ottobre 2026",
  totals: { onlineEurCents: 50000, directEurCents: 25000, feesEurCents: 4270, payoutsArrivedEurCents: 15342, refundsEurCents: 0, disputedEurCents: 0 },
  rows: [
    { jobPaymentId: "a1", date: "2026-10-05T10:00:00Z", job: "Idraulico, perdita sotto il lavello", client: "Anna B.", onlineEurCents: 4000, directEurCents: 0, feesEurCents: 342, payoutEurCents: 3658, payoutNote: null, refundsEurCents: 0, disputed: false },
    { jobPaymentId: "a2", date: "2026-10-09T10:00:00Z", job: "Idraulico, perdita sotto il lavello", client: "Anna B.", onlineEurCents: 16000, directEurCents: 0, feesEurCents: 1366, payoutEurCents: 11684, payoutNote: null, refundsEurCents: 0, disputed: false },
    { jobPaymentId: "b1", date: "2026-10-21T10:00:00Z", job: "Idraulico, sostituzione rubinetti", client: "Luca V.", onlineEurCents: 30000, directEurCents: 0, feesEurCents: 2562, payoutEurCents: null, payoutNote: "Bloccati 274,38 €: partono quando il cliente conferma", refundsEurCents: 0, disputed: false },
    { jobPaymentId: "c1", date: "2026-10-28T10:00:00Z", job: "Idraulico, caldaia", client: "Sara M.", onlineEurCents: 0, directEurCents: 25000, feesEurCents: 0, payoutEurCents: null, payoutNote: "Pagato direttamente a te", refundsEurCents: 0, disputed: false },
  ],
  blockedEurCents: 27438,
  feeInvoice: { id: "f", number: "COM/2026/0001" },
  feeInvoiceExpected: true,
  documentHint: "Per ogni pagamento ricordati di fare la fattura al cliente col tuo programma.",
} as MonthlyStatement;

const OCCASIONAL_NOTES = ["Prestazione occasionale, senza partita IVA (art. 67, comma 1, lettera l, del TUIR).", "Operazione fuori campo IVA ai sensi dell'art. 5 del DPR n. 633/1972."];
const STAMP_NOTE = "Marca da bollo da 2 € sull'originale (importo oltre 77,47 €).";

const occasionalParty = { name: "Giulia Verdi", lines: ["Codice fiscale VRDGLI90A41F205X", "Via Torino 5, 20123 Milano (MI)"] };

const receiptToPerson = courtesyPdfModel({
  kind: "RECEIPT",
  issuer: occasionalParty,
  customer: { name: "Anna Bianchi", lines: ["Via Verdi 3, 20121 Milano (MI)"] },
  date: "2026-10-20T10:00:00Z",
  lines: [{ description: "Pulizie di fine cantiere", amountEurCents: 6000 }],
  totalEurCents: 6000,
  withholding: null,
  paidHow: null,
  notes: OCCASIONAL_NOTES,
  hints: [],
  invoiceRequested: false,
  customerFields: null,
  number: "1/2026",
  missing: [],
} as never);

const receiptToCompany = courtesyPdfModel({
  kind: "RECEIPT",
  issuer: occasionalParty,
  customer: { name: "Bar Sport S.r.l.", lines: ["P.IVA 12345678903", "Via Milano 2, 20100 Milano (MI)"] },
  date: "2026-10-25T10:00:00Z",
  lines: [{ description: "Pulizie del locale", amountEurCents: 18000 }],
  totalEurCents: 18000,
  withholding: { applies: true, amountEurCents: 3600, netEurCents: 14400 },
  paidHow: null,
  notes: [...OCCASIONAL_NOTES, STAMP_NOTE],
  hints: [],
  invoiceRequested: true,
  customerFields: null,
  number: "2/2026",
  missing: [],
} as never);

const yearSummary: CourtesyYearSummary = {
  year: 2026,
  who: "Giulia Verdi",
  receipts: [
    { number: "1/2026", date: "2026-10-20T10:00:00Z", customerName: "Anna Bianchi", customerHasVatNumber: false, customerTaxId: "BNCNNA85C41F205Y", paidAt: "2026-10-20T10:00:00Z", jobLabel: "Pulizie", totalEurCents: 6000, currentEurCents: null, withholdingEurCents: null, stampDuty: false, amountChanged: false },
    { number: "2/2026", date: "2026-10-25T10:00:00Z", customerName: "Bar Sport S.r.l.", customerHasVatNumber: true, customerTaxId: "12345678903", paidAt: "2026-10-25T10:00:00Z", jobLabel: "Pulizie", totalEurCents: 18000, currentEurCents: null, withholdingEurCents: 3600, stampDuty: true, amountChanged: false },
  ],
} as CourtesyYearSummary;

const pdfs: [string, PdfDocumentModel][] = [
  ...invoices.map((i) => [i.file, invoicePdfModel(i.view)] as [string, PdfDocumentModel]),
  ["06-estratto-del-mese", statementPdfModel(statement, "Mario Rossi")],
  ["07-ricevuta-lavoro-occasionale-a-privato", receiptToPerson],
  ["08-ricevuta-lavoro-occasionale-a-partita-iva", receiptToCompany],
  ["09-riepilogo-anno-ricevute", courtesyYearPdfModel(yearSummary, new Date("2027-01-15T10:00:00Z"))],
  [
    "10-riepilogo-dac7",
    dac7PdfModel(
      { year: 2026, quarters: [{ quarter: 3, directEurCents: 25000, onlineEurCents: 0, feesEurCents: 0, jobs: 1 }, { quarter: 4, directEurCents: 25000, onlineEurCents: 50000, feesEurCents: 4270, jobs: 3 }], totalEurCents: 100000, submittedAt: "2027-01-28T10:00:00Z", submissionProtocol: "26012810000012345", notifiedAt: "2027-01-20T10:00:00Z" },
      "IT60 •••• •••• 1234",
      "Mario Rossi",
      new Date("2027-02-01T10:00:00Z"),
    ),
  ],
];

// Preventivo e riepilogo dei pagamenti del cliente: stesso codice del sito
// (QuotePdfService) con un database finto in memoria. La chiave finta accende
// solo l'acconto online nel testo, non chiama Stripe.
process.env.STRIPE_SECRET_KEY ??= "sk_test_finta_solo_per_esempio";
const quoteStart = new Date("2026-12-10T08:00:00Z");
const exampleQuote = {
  id: "esempio",
  status: "ACCEPTED",
  createdAt: new Date("2026-12-01T09:30:00Z"),
  resentAt: null,
  estimatedStartDate: quoteStart,
  estimatedEndDate: new Date("2026-12-10T11:00:00Z"),
  paymentOptions: ["MIXED", "DIRECT"],
  depositPercent: 30,
  cancellationNoticeHours: 48,
  lateCancelKeepsDeposit: false,
  notes: "Porto io i pezzi di ricambio. Il prezzo finale dipende da quanto è rovinato il tubo.",
  items: [
    { name: "Sostituzione rubinetto cucina", priceMinEurCents: 8000, priceMaxEurCents: 8000 },
    { name: "Riparazione tubo sotto il lavello", priceMinEurCents: 6000, priceMaxEurCents: 9000 },
    { name: "Uscita e trasporto", priceMinEurCents: 3000, priceMaxEurCents: 3000 },
  ],
  guidedRequest: {
    clientId: "cliente",
    description: "Il rubinetto della cucina perde e sotto il lavello c'è acqua. (ESEMPIO CON DATI INVENTATI)",
    city: "Bologna",
    serviceMode: "HOME",
    category: { label: "Idraulico" },
  },
  professionalProfile: {
    userId: "professionista",
    businessName: "Idraulica Rossi (esempio)",
    city: "Bologna",
    cancellationNoticeHours: 48,
    fiscalProfile: { stripePayoutsEnabled: true, entityType: "SOLE_PROPRIETOR", chargesVat: true, businessName: null, fiscalFirstName: "Mario", fiscalLastName: "Rossi", vatNumber: "01234567890", registeredCity: "Bologna", registeredProvince: "BO" },
  },
  booking: { createdAt: new Date("2026-12-02T18:10:00Z") },
};
const exampleDb = {
  quote: { findUnique: async () => exampleQuote },
  booking: { findUniqueOrThrow: async () => ({ scheduledAt: quoteStart, professionalProfile: { businessName: "Idraulica Rossi (esempio)" }, quote: { guidedRequest: { category: { label: "Idraulico" } } } }) },
};
const exampleJobDocuments = { forUser: async () => ({ audience: "CLIENT", movements: [{ label: "Acconto online con carta", date: "2026-12-02T18:10:00Z", amountEurCents: -5100 }] }) };
const quotePdfs = new QuotePdfService(exampleDb as never, exampleJobDocuments as never);

async function main() {
  for (const [name, model] of pdfs) writeFileSync(join(out, `${name}.pdf`), await renderDocumentPdf(model));
  writeFileSync(join(out, "13-preventivo.pdf"), await renderDocumentPdf((await quotePdfs.forUser("cliente", "esempio")).model));
  writeFileSync(join(out, "14-riepilogo-pagamenti-del-cliente.pdf"), await renderDocumentPdf((await quotePdfs.paymentsForClient("cliente", "esempio")).model));

  invoices.forEach((i, index) => {
    const [series, year, number] = i.view.number.split("/");
    const progressive = sdiProgressive(series!, Number(year), Number(number), 0);
    const xml = buildFatturaPaXml({
      progressive,
      recipientCode: professional.sdiRecipientCode,
      recipientPec: null,
      issuer: fatturaPaIssuer(issuer),
      customer: fatturaPaCustomer(professional),
      documentType: i.xmlType,
      date: i.view.issuedAt.slice(0, 10),
      number: i.view.number,
      lines: i.view.lines.map((line) => ({ description: xmlLineDescription(line), taxableEurCents: Math.abs(line.taxableEurCents) })),
      vatRateBasisPoints: 2200,
      taxableEurCents: Math.abs(i.view.taxableEurCents),
      vatEurCents: Math.abs(i.view.vatEurCents),
      roundingEurCents: i.view.roundingEurCents,
      totalEurCents: i.view.totalEurCents,
      paymentMethod: i.payment,
      related: i.related,
      causale: i.causale,
    });
    writeFileSync(join(out, `${String(index + 1).padStart(2, "0")}-${fatturaPaFileName(issuer.vatNumber!, progressive)}`), xml);
  });
  console.log(`Pacchetto in ${out}/: ${pdfs.length + 2} PDF e ${invoices.length} XML.`);
}

void main();
