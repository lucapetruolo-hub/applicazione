import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cashbookMonths,
  cashbookRegimeOf,
  cashbookTotals,
  cashbookYearCsv,
  estimateForfettarioTax,
  expenseInputSchema,
  forfettarioThresholdLevel,
  vatInsideGross,
  type CashbookMovement,
} from "./cashbook";

const mv = (date: string, source: CashbookMovement["source"], amountEurCents: number, extra: Partial<CashbookMovement> = {}): CashbookMovement => ({
  date,
  source,
  label: source,
  detail: "",
  amountEurCents,
  vatEurCents: null,
  document: "",
  ...extra,
});

test("totali: i rimborsi tolgono dalle entrate, le uscite sono positive", () => {
  const t = cashbookTotals([mv("2026-03-01", "ONLINE", 50000), mv("2026-03-02", "REFUND", -8000), mv("2026-03-03", "FEE", -4270), mv("2026-03-04", "EXPENSE", -12000)]);
  assert.deepEqual(t, { incomeEurCents: 42000, expensesEurCents: 16270, leftEurCents: 25730 });
});

test("mesi: dodici mesi, ciascuno con le sue righe", () => {
  const months = cashbookMonths(2026, [mv("2026-01-08", "ONLINE", 40000), mv("2026-12-31", "EXPENSE", -100)]);
  assert.equal(months.length, 12);
  assert.equal(months[0]!.incomeEurCents, 40000);
  assert.equal(months[11]!.expensesEurCents, 100);
  assert.equal(months[5]!.leftEurCents, 0);
});

test("scorporo dell'IVA", () => {
  assert.equal(vatInsideGross(12200, 22), 2200);
  assert.equal(vatInsideGross(11000, 10), 1000);
  assert.equal(vatInsideGross(10000, 0), 0);
});

test("stima del forfettario: coefficiente, contributi INPS tolti, mai sotto zero", () => {
  const e = estimateForfettarioTax({ incomeEurCents: 3_000_000, socialSecurityPaidEurCents: 450_000, coefficientPercent: 86, ratePercent: 15 });
  assert.equal(e.taxableEurCents, 2_130_000);
  assert.equal(e.taxEurCents, 319_500);
  assert.equal(estimateForfettarioTax({ incomeEurCents: -5000, socialSecurityPaidEurCents: 0, coefficientPercent: 67, ratePercent: 5 }).taxEurCents, 0);
  assert.equal(estimateForfettarioTax({ incomeEurCents: 100_000, socialSecurityPaidEurCents: 500_000, coefficientPercent: 67, ratePercent: 5 }).taxableEurCents, 0);
});

test("soglia del forfettario", () => {
  assert.equal(forfettarioThresholdLevel(6_999_999), null);
  assert.equal(forfettarioThresholdLevel(7_000_000), "near");
  assert.equal(forfettarioThresholdLevel(8_500_001), "over");
  assert.equal(forfettarioThresholdLevel(10_000_001), "exit");
});

test("regime dai dati fiscali", () => {
  assert.equal(cashbookRegimeOf("SOLE_PROPRIETOR", false), "FORFETTARIO");
  assert.equal(cashbookRegimeOf("SOLE_PROPRIETOR", true), "VAT");
  assert.equal(cashbookRegimeOf("SOLE_PROPRIETOR", null), "OTHER");
  assert.equal(cashbookRegimeOf("PRIVATE_INDIVIDUAL", null), "OCCASIONAL");
  assert.equal(cashbookRegimeOf("BUSINESS", true), "VAT");
  assert.equal(cashbookRegimeOf(null, null), "OTHER");
});

test("spesa: importo, data e categoria obbligatori", () => {
  assert.equal(expenseInputSchema.safeParse({ spentOn: "2026-03-03", amountEurCents: 1200, category: "MATERIALS" }).success, true);
  assert.equal(expenseInputSchema.safeParse({ spentOn: "3/3/2026", amountEurCents: 1200, category: "MATERIALS" }).success, false);
  assert.equal(expenseInputSchema.safeParse({ spentOn: "2026-03-03", amountEurCents: 0, category: "MATERIALS" }).success, false);
  assert.equal(expenseInputSchema.safeParse({ spentOn: "2026-03-03", amountEurCents: 100, category: "CAFFE" }).success, false);
});

test("foglio dell'anno: punto e virgola, date e cifre all'italiana, riepilogo dei mesi, niente formule", () => {
  const movements = [mv("2026-01-08", "ONLINE", 40000, { detail: "Idraulico, perdita" }), mv("2026-03-03", "EXPENSE", -12000, { label: "Materiali", detail: "=SOMMA(A1)" })];
  const months = cashbookMonths(2026, movements);
  const csv = cashbookYearCsv({ year: 2026, movements, months, totals: cashbookTotals(movements) });
  assert.ok(csv.startsWith("﻿Data;Entrata o uscita;Tipo;Dettaglio;Importo;Di cui IVA;Documento\r\n"));
  assert.ok(csv.includes("08/01/2026;Entrata;ONLINE;Idraulico, perdita;400,00;;"));
  assert.ok(csv.includes("03/03/2026;Uscita;Materiali;'=SOMMA(A1);-120,00;;"));
  assert.ok(csv.includes("Gennaio;400,00;0,00;400,00"));
  assert.ok(csv.includes("Totale 2026;400,00;-120,00;280,00"));
});
