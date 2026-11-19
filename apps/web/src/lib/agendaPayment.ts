import { formatEurCents, formatServicePriceRange, quotePriceTotals, type ProfessionalBooking } from "@professionisti/shared";

/**
 * Pagamento nel riquadro dell'appuntamento (docs/CHANGELOG.md §288), a righe
 * come un conto (richiesta di Luca, docs/changelog/2026-11-19-pagamento-in-agenda.md):
 * totale del preventivo, pagato online, quello che resta. `strong` è la riga
 * che interessa di più adesso (quanto resta da incassare), `done` una cifra già pagata.
 */
export type AgendaPaymentRow = { label: string; value: string; strong?: boolean; done?: boolean };
export type AgendaPayment = { rows: AgendaPaymentRow[]; note: string; paid: boolean };

type BookingPaymentInput = Pick<ProfessionalBooking, "status" | "items" | "finalAmountEurCents" | "payment">;

function quoteRange(items: BookingPaymentInput["items"], minusCents = 0): string | null {
  if (items.length === 0) return null;
  const { totalMinEurCents, totalMaxEurCents } = quotePriceTotals(items);
  if (totalMaxEurCents === 0) return null;
  return formatServicePriceRange(Math.max(0, totalMinEurCents - minusCents), Math.max(0, totalMaxEurCents - minusCents));
}

export function agendaPayment(booking: BookingPaymentInput): AgendaPayment {
  const payment = booking.payment;
  const online = payment?.method === "ONLINE";
  const paid = payment?.paidEurCents ?? 0;
  const rows: AgendaPaymentRow[] = [];

  if (booking.status === "COMPLETED" && booking.finalAmountEurCents !== null) {
    rows.push({ label: "Importo finale", value: formatEurCents(booking.finalAmountEurCents) });
    if (!online) return { rows, note: "Pagamento diretto: ti paga il cliente.", paid: false };
    if (paid > 0) rows.push({ label: "Pagato online", value: formatEurCents(paid), done: true });
    const due = payment?.balanceDueEurCents ?? 0;
    if (due > 0) {
      rows.push({ label: payment?.balanceDirect ? "Resta da incassare" : "Resta da pagare online", value: formatEurCents(due), strong: true });
      return { rows, note: payment?.balanceDirect ? "Il saldo te lo paga il cliente." : "Il saldo lo paga il cliente online.", paid: false };
    }
    if (payment?.balanceDirect && payment.directBalanceEurCents) rows.push({ label: "Saldo diretto", value: formatEurCents(payment.directBalanceEurCents) });
    return { rows, note: payment?.balanceDirect ? "Pagato: acconto online, saldo diretto." : "Pagato tutto online.", paid: true };
  }

  const total = quoteRange(booking.items);
  if (total) rows.push({ label: "Totale del preventivo", value: total });
  if (!online) return { rows, note: "Pagamento diretto: ti paga il cliente a fine lavoro.", paid: false };

  if (paid > 0) {
    rows.push({ label: "Acconto pagato online", value: formatEurCents(paid), done: true });
    const rest = quoteRange(booking.items, paid);
    if (rest) rows.push({ label: "Resta a fine lavoro", value: rest, strong: true });
    return { rows, note: payment?.balanceDirect ? "Il saldo te lo paga il cliente a fine lavoro." : "Il saldo lo paga online a fine lavoro.", paid: true };
  }
  if (payment?.depositEurCents) rows.push({ label: "Acconto online da pagare", value: formatEurCents(payment.depositEurCents), strong: true });
  return { rows, note: "Acconto online non ancora pagato: il lavoro si conferma col pagamento.", paid: false };
}
