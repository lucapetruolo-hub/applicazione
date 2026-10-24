import { formatEurCents, formatServicePriceRange, quotePriceTotals, type ProfessionalBooking } from "@professionisti/shared";

/** Riga del pagamento nel riquadro dell'appuntamento (docs/CHANGELOG.md §288): cosa è già pagato e cosa resta da incassare. */
export type AgendaPaymentLine = { title: string; detail: string; amount: string | null; paid: boolean };

type BookingPaymentInput = Pick<ProfessionalBooking, "status" | "items" | "finalAmountEurCents" | "payment">;

function quoteRange(items: BookingPaymentInput["items"], minusCents = 0): string | null {
  if (items.length === 0) return null;
  const { totalMinEurCents, totalMaxEurCents } = quotePriceTotals(items);
  if (totalMaxEurCents === 0) return null;
  return formatServicePriceRange(Math.max(0, totalMinEurCents - minusCents), Math.max(0, totalMaxEurCents - minusCents));
}

export function agendaPaymentLine(booking: BookingPaymentInput): AgendaPaymentLine {
  const payment = booking.payment;
  const online = payment?.method === "ONLINE";
  const paid = payment?.paidEurCents ?? 0;

  if (booking.status === "COMPLETED" && booking.finalAmountEurCents !== null) {
    const total = formatEurCents(booking.finalAmountEurCents);
    if (!online) return { title: "Pagamento diretto", detail: "Importo finale del lavoro", amount: total, paid: false };
    if ((payment?.balanceDueEurCents ?? 0) > 0) {
      return {
        title: payment?.balanceDirect ? "Saldo da incassare" : "Saldo da pagare online",
        detail: `Già pagato online ${formatEurCents(paid)}`,
        amount: formatEurCents(payment!.balanceDueEurCents),
        paid: false,
      };
    }
    return { title: "Pagato", detail: payment?.balanceDirect ? "Acconto online, saldo diretto" : "Tutto online", amount: total, paid: true };
  }

  if (!online) {
    return { title: "Pagamento diretto", detail: "Ti paga il cliente a fine lavoro", amount: quoteRange(booking.items), paid: false };
  }
  if (paid > 0) {
    return {
      title: `Acconto pagato online ${formatEurCents(paid)}`,
      detail: payment?.balanceDirect ? "Il saldo te lo paga il cliente a fine lavoro" : "Il saldo lo paga online a fine lavoro",
      amount: quoteRange(booking.items, paid),
      paid: true,
    };
  }
  return {
    title: "Acconto online non ancora pagato",
    detail: payment?.depositEurCents ? `Acconto di ${formatEurCents(payment.depositEurCents)}` : "Il lavoro si conferma col pagamento",
    amount: quoteRange(booking.items),
    paid: false,
  };
}
