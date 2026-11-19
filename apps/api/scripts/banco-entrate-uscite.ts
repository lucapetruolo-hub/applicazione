// Banco di Entrate e uscite (docs/changelog/2026-11-19-entrate-e-uscite.md).
//
// Crea in un database di PROVA un professionista con i casi limite
// (dicembre/gennaio, rimborso il mese dopo, acconto online + saldo diretto,
// saldo non pagato, lavoro fuori dal sito, spese, abbonamento, mezzanotte di
// Roma), poi confronta mese per mese:
//   - le Statistiche di prima (importo finale nel giorno di "Lavoro terminato", in UTC);
//   - l'estratto del mese (incassi online + diretti);
//   - la scheda Entrate e uscite;
//   - le cifre attese, calcolate a mano qui sotto.
//
//   DATABASE_URL=postgresql://...locale... pnpm --filter @professionisti/api exec tsx scripts/banco-entrate-uscite.ts [file.md]
//
// Si rifiuta se DATABASE_URL non punta a localhost: mai sul database vero.
import { writeFileSync } from "node:fs";
import { prisma } from "@professionisti/database";
import { formatEurCents } from "@professionisti/shared";
import { StatementsService } from "../src/accounting/statements.service";
import { CashbookService } from "../src/cashbook/cashbook.service";
import { RevenueAnalyticsService } from "../src/revenue-analytics/revenue-analytics.service";
import type { InvoicesService } from "../src/accounting/invoices.service";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("Solo su un database locale di prova (DATABASE_URL con localhost).");
  process.exit(1);
}

const EMAIL = "banco.entrate@prova.example.com";
const at = (iso: string) => new Date(iso);

async function seed() {
  const old = await prisma.user.findUnique({ where: { email: EMAIL }, select: { id: true, professionalProfile: { select: { id: true } } } });
  if (old) {
    const pid = old.professionalProfile?.id;
    if (pid) {
      await prisma.platformFeeEntry.deleteMany({ where: { professionalProfileId: pid } });
      await prisma.invoice.deleteMany({ where: { professionalProfileId: pid } });
      const bookings = await prisma.booking.findMany({ where: { professionalProfileId: pid }, select: { id: true } });
      await prisma.jobPayment.deleteMany({ where: { bookingId: { in: bookings.map((b) => b.id) } } });
      await prisma.booking.deleteMany({ where: { professionalProfileId: pid } });
      await prisma.quote.deleteMany({ where: { professionalProfileId: pid } });
    }
    await prisma.guidedRequest.deleteMany({ where: { client: { email: { endsWith: "banco.entrate@prova.example.com" } } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "banco.entrate@prova.example.com" } } });
  }
  const category = await prisma.category.upsert({ where: { slug: "idraulico" }, update: {}, create: { slug: "idraulico", label: "Idraulico" } });
  const proUser = await prisma.user.create({ data: { email: EMAIL, role: "PROFESSIONAL", name: "Banco", surname: "Entrate", testAccountAt: new Date() } });
  const client = await prisma.user.create({ data: { email: `cliente.${EMAIL}`, role: "CLIENT", name: "Carla", surname: "Rossi", testAccountAt: new Date() } });
  const profile = await prisma.professionalProfile.create({
    data: { userId: proUser.id, categoryId: category.id, businessName: "Banco Entrate", city: "Bologna", latitude: 44.49, longitude: 11.34 },
  });
  await prisma.professionalFiscalProfile.create({ data: { professionalProfileId: profile.id, entityType: "SOLE_PROPRIETOR", chargesVat: false } });
  await prisma.professionalCashbookSettings.create({ data: { professionalProfileId: profile.id, includeExternalJobs: true, taxCoefficient: "COSTRUZIONI", taxRatePercent: 5 } });

  async function job(key: string, opts: { scheduledAt: string; completedAt: string; final: number }) {
    const request = await prisma.guidedRequest.create({ data: { clientId: client.id, categoryId: category.id, description: `Caso ${key}`, city: "Bologna" } });
    const quote = await prisma.quote.create({ data: { guidedRequestId: request.id, professionalProfileId: profile.id, estimatedStartDate: at(opts.scheduledAt) } });
    return prisma.booking.create({
      data: {
        quoteId: quote.id,
        guidedRequestId: request.id,
        clientId: client.id,
        professionalProfileId: profile.id,
        scheduledAt: at(opts.scheduledAt),
        status: "COMPLETED",
        finalAmountEurCents: opts.final,
        professionalCompletedAt: at(opts.completedAt),
        clientConfirmedCompletedAt: at(opts.completedAt),
        updatedAt: at(opts.completedAt),
      },
    });
  }
  const fee = (paid: number) => {
    const taxable = Math.round(paid * 0.07);
    const vat = Math.round(taxable * 0.22);
    return { taxable, vat, gross: taxable + vat };
  };
  async function online(bookingId: string, paidAt: string, paid: number, extra: Record<string, unknown> = {}) {
    const jp = await prisma.jobPayment.create({
      data: { bookingId, paymentMethod: "MANOVIA", status: "CONFIRMED", grossAmountEurCents: paid, netAmountEurCents: paid, paidEurCents: paid, onlineStage: "PAID", ...extra },
    });
    const f = fee(paid);
    await prisma.platformFeeEntry.create({
      data: { professionalProfileId: profile.id, jobPaymentId: jp.id, kind: "HOLD", grossEurCents: f.gross, taxableEurCents: f.taxable, vatEurCents: f.vat, paymentEurCents: paid, description: "Pagamento online", dedupeKey: `HOLD:pi_${jp.id}`, occurredAt: at(paidAt) },
    });
    return jp;
  }

  // A. Pagamento diretto, marzo.
  const a = await job("A", { scheduledAt: "2026-03-10T08:00:00Z", completedAt: "2026-03-10T11:00:00Z", final: 30000 });
  await prisma.jobPayment.create({ data: { bookingId: a.id, paymentMethod: "DIRECT", status: "CONFIRMED", grossAmountEurCents: 30000, netAmountEurCents: 30000, directReportedAt: at("2026-03-10T11:00:00Z") } });
  // B. Pagato online, marzo.
  const b = await job("B", { scheduledAt: "2026-03-28T08:00:00Z", completedAt: "2026-03-28T11:00:00Z", final: 50000 });
  await online(b.id, "2026-03-28T11:05:00Z", 50000);
  // C. Terminato il 30 dicembre 2025, saldo online pagato l'8 gennaio 2026.
  const c = await job("C", { scheduledAt: "2025-12-30T08:00:00Z", completedAt: "2025-12-30T11:00:00Z", final: 40000 });
  await online(c.id, "2026-01-08T09:00:00Z", 40000);
  // D. Pagato online ad aprile, rimborso di 80 € il 3 maggio.
  const d = await job("D", { scheduledAt: "2026-04-05T08:00:00Z", completedAt: "2026-04-05T11:00:00Z", final: 20000 });
  const dJp = await online(d.id, "2026-04-05T11:05:00Z", 20000, { refundedEurCents: 8000 });
  await prisma.auditLog.create({ data: { entityType: "JobPayment", entityId: dJp.id, fieldName: "refundedEurCents", oldValue: "0", newValue: "8000", createdAt: at("2026-05-03T10:00:00Z") } });
  // E. Acconto online 100 € il 1° giugno, saldo diretto a lavoro finito il 15 giugno (totale 600 €).
  const e = await job("E", { scheduledAt: "2026-06-15T08:00:00Z", completedAt: "2026-06-15T11:00:00Z", final: 60000 });
  await online(e.id, "2026-06-01T09:00:00Z", 10000, { balanceDirect: true, depositEurCents: 10000, depositPaidAt: at("2026-06-01T09:00:00Z"), grossAmountEurCents: 60000 });
  // F. Pagamento diretto mai segnato (come i vecchi account di prova), luglio.
  const f = await job("F", { scheduledAt: "2026-07-01T08:00:00Z", completedAt: "2026-07-01T11:00:00Z", final: 25000 });
  await prisma.jobPayment.create({ data: { bookingId: f.id, paymentMethod: "DIRECT", status: "PENDING", grossAmountEurCents: 25000, netAmountEurCents: 25000 } });
  // G. Acconto online 150 € il 1° agosto, saldo di 300 € non ancora pagato.
  const g = await job("G", { scheduledAt: "2026-08-10T08:00:00Z", completedAt: "2026-08-10T11:00:00Z", final: 45000 });
  await online(g.id, "2026-08-01T09:00:00Z", 15000, { onlineStage: "AWAITING_BALANCE", depositEurCents: 15000, depositPaidAt: at("2026-08-01T09:00:00Z"), grossAmountEurCents: 45000 });
  // K. Pagamento diretto alle 00:30 di Roma del 1° novembre (23:30 UTC del 31 ottobre).
  const k = await job("K", { scheduledAt: "2026-10-31T20:00:00Z", completedAt: "2026-10-31T23:30:00Z", final: 9000 });
  await prisma.jobPayment.create({ data: { bookingId: k.id, paymentMethod: "DIRECT", status: "CONFIRMED", grossAmountEurCents: 9000, netAmountEurCents: 9000, directReportedAt: at("2026-10-31T23:30:00Z") } });
  // H. Lavoro fuori dal sito fatto, 180 €, e uno senza prezzo.
  await prisma.externalJob.create({ data: { professionalProfileId: profile.id, clientName: "Bar Sport", scheduledAt: at("2026-09-12T08:00:00Z"), priceEurCents: 18000, status: "COMPLETED" } });
  await prisma.externalJob.create({ data: { professionalProfileId: profile.id, clientName: "Vicino", scheduledAt: at("2026-09-20T08:00:00Z"), status: "COMPLETED" } });
  // I. Abbonamento di febbraio, 19 € + IVA.
  await prisma.invoice.create({
    data: { type: "MANOVIA_TO_PROFESSIONAL", source: "SUBSCRIPTION", status: "ISSUED", professionalProfileId: profile.id, amountEurCents: 2318, taxableEurCents: 1900, vatEurCents: 418, series: "ABB", year: 2026, number: 1, issuedAt: at("2026-02-01T08:00:00Z") },
  });
  // J. Spese a mano.
  await prisma.professionalExpense.create({ data: { professionalProfileId: profile.id, spentOn: at("2026-03-03T00:00:00Z"), amountEurCents: 12000, category: "MATERIALS", description: "Raccordi e tubi" } });
  await prisma.professionalExpense.create({ data: { professionalProfileId: profile.id, spentOn: at("2026-05-16T00:00:00Z"), amountEurCents: 110000, category: "SOCIAL_SECURITY", description: "Rata INPS" } });

  return { userId: proUser.id, profileId: profile.id };
}

// Cifre attese, a mano (euro in centesimi), per mese del 2026.
const EXPECTED_INCOME: Record<string, number> = {
  "2026-01": 40000, // C: soldi arrivati a gennaio
  "2026-03": 30000 + 50000, // A + B
  "2026-04": 20000, // D
  "2026-05": -8000, // rimborso di D
  "2026-06": 10000 + 50000, // E: acconto + saldo diretto
  "2026-08": 15000, // G: solo l'acconto, il saldo è da incassare
  "2026-09": 18000, // H
  "2026-11": 9000, // K: 00:30 di Roma del 1° novembre
};
// L'estratto conta solo i soldi passati dal sito: senza i lavori fuori dal sito.
const EXPECTED_EXTERNAL: Record<string, number> = { "2026-09": 18000 };
const feeOf = (paid: number) => Math.round(paid * 0.07) + Math.round(Math.round(paid * 0.07) * 0.22);
const EXPECTED_EXPENSES: Record<string, number> = {
  "2026-01": feeOf(40000),
  "2026-02": 2318,
  "2026-03": 12000 + feeOf(50000),
  "2026-04": feeOf(20000),
  "2026-05": 110000,
  "2026-06": feeOf(10000),
  "2026-08": feeOf(15000),
};
const EXPECTED_TO_COLLECT = 25000 + 30000; // F + saldo di G

async function main() {
  const { userId, profileId } = await seed();
  const invoices = { activeIssuer: async () => null } as unknown as InvoicesService;
  const statements = new StatementsService(prisma as never, {} as never, invoices, {} as never);
  const cashbook = new CashbookService(prisma as never, statements);
  const stats = new RevenueAnalyticsService(prisma as never, cashbook);

  const overview = await cashbook.overview(userId, 2026, at("2026-12-31T12:00:00Z"));
  const statsNew = await stats.getProfessionalStats(profileId, "2026-01-01", "2026-12-31");
  // Le Statistiche di prima: importo finale nel giorno di "Lavoro terminato", mese in UTC.
  const completed = await prisma.booking.findMany({ where: { professionalProfileId: profileId, status: "COMPLETED" }, select: { professionalCompletedAt: true, finalAmountEurCents: true } });
  const oldStats = new Map<string, number>();
  for (const bk of completed) {
    const key = bk.professionalCompletedAt!.toISOString().slice(0, 7);
    oldStats.set(key, (oldStats.get(key) ?? 0) + (bk.finalAmountEurCents ?? 0));
  }

  const eur = (c: number) => (c === 0 ? "0" : formatEurCents(c));
  const lines: string[] = [];
  lines.push("| Mese | Statistiche prima | Estratto (incassi) | Entrate e uscite: entrate | Statistiche ora | Attese | Uscite scheda | Uscite attese | Esito |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  let ok = true;
  for (let m = 1; m <= 12; m++) {
    const month = `2026-${String(m).padStart(2, "0")}`;
    const st = (await statements.build(profileId, month)).statement.totals;
    const statement = st.onlineEurCents + st.directEurCents;
    const row = overview.months[m - 1]!;
    const statsMonth = statsNew.buckets.find((bk) => bk.key === month)?.revenueEurCents ?? 0;
    const exp = EXPECTED_INCOME[month] ?? 0;
    const expOut = EXPECTED_EXPENSES[month] ?? 0;
    const good = row.incomeEurCents === exp && statsMonth === exp && statement === exp - (EXPECTED_EXTERNAL[month] ?? 0) && row.expensesEurCents === expOut;
    if (!good) ok = false;
    lines.push(`| ${row.label} | ${eur(oldStats.get(month) ?? 0)} | ${eur(statement)} | ${eur(row.incomeEurCents)} | ${eur(statsMonth)} | ${eur(exp)} | ${eur(row.expensesEurCents)} | ${eur(expOut)} | ${good ? "ok" : "DIVERSO"} |`);
  }
  const toCollect = overview.toCollect.reduce((s, t) => s + t.amountEurCents, 0);
  lines.push("");
  lines.push("L'estratto conta solo i soldi passati dal sito: a settembre mancano di proposito i 180 € del lavoro fuori dal sito.");
  lines.push(`Dicembre 2025 nelle Statistiche di prima: ${eur(oldStats.get("2025-12") ?? 0)} (lavoro C, pagato a gennaio).`);
  lines.push(`Da incassare: ${eur(toCollect)} (atteso ${eur(EXPECTED_TO_COLLECT)}) ${toCollect === EXPECTED_TO_COLLECT ? "ok" : "DIVERSO"}.`);
  lines.push(`Totale anno: entrate ${eur(overview.totals.incomeEurCents)}, uscite ${eur(overview.totals.expensesEurCents)}, ti resta ${eur(overview.totals.leftEurCents)}.`);
  if (overview.taxEstimate) {
    lines.push(`Stima imposta (86%, 5%, INPS ${eur(overview.taxEstimate.socialSecurityPaidEurCents)} tolta): reddito ${eur(overview.taxEstimate.taxableEurCents)}, imposta ${eur(overview.taxEstimate.taxEurCents)}.`);
  }
  lines.push(`Lavori fuori dal sito senza prezzo: ${overview.externalWithoutPrice}.`);
  if (toCollect !== EXPECTED_TO_COLLECT) ok = false;
  lines.push("", ok ? "**Esito: tutte le cifre coincidono con quelle attese.**" : "**Esito: ci sono cifre diverse da quelle attese.**");
  const out = lines.join("\n");
  console.log(out);
  if (process.argv[2]) writeFileSync(process.argv[2], `${out}\n`);
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
