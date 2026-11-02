"use client";

import Link from "next/link";
import type { ClientGuidedRequest } from "@professionisti/api-client";
import {
  TRADER_STATUS_COPY,
  cancellationNoticeLabel,
  formatServicePriceRange,
  isLateCancellation,
  jobPaymentChoiceCopy,
  paymentChoiceIsOnline,
  quotePriceTaxNote,
  type JobPaymentChoice,
} from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * Riepilogo prima di accettare un preventivo (collaudo A-07, M-02, A-06,
 * C-08, docs/changelog/2026-11-02-collaudo-accettazione-e-chiusure.md):
 * prima un solo tocco fissava il lavoro e passava i contatti. Dice con chi,
 * quando, quanto e come si paga, chi esegue il lavoro (Codice del consumo
 * art. 49), il recesso, che il professionista vedrà telefono e indirizzo e,
 * se l'appuntamento è già dentro il preavviso, cosa succede annullando.
 */
export function QuoteAcceptSummary({
  quote,
  dateText,
  priceTotals,
  payment,
  showPaymentLine,
  onlinePayments,
}: {
  quote: ClientGuidedRequest["quotes"][number];
  dateText: string;
  priceTotals: { totalMinEurCents: number; totalMaxEurCents: number };
  payment: JobPaymentChoice;
  /** Con un solo modo di pagamento non c'è la scelta sopra: lo dice il riepilogo. */
  showPaymentLine: boolean;
  onlinePayments: boolean;
}) {
  const priceText =
    priceTotals.totalMinEurCents > 0 || priceTotals.totalMaxEurCents > 0 ? formatServicePriceRange(priceTotals.totalMinEurCents, priceTotals.totalMaxEurCents) : null;
  const alreadyLate = isLateCancellation(quote.estimatedStartDate, quote.cancellationNoticeHours);
  const keepsDeposit = quote.lateCancelKeepsDeposit && onlinePayments && paymentChoiceIsOnline(payment);
  const executor = quote.executor ?? null;
  const isPrivate = quote.professionalKind === "PRIVATE";
  const row = (label: string, value: string) => (
    <XStack gap="2" flexWrap="wrap">
      <Text fontSize={16} color={brand.grafite70} minWidth={90}>
        {label}
      </Text>
      <Text flex={1} minWidth={160} fontSize={16} fontWeight="600" color={brand.grafite}>
        {value}
      </Text>
    </XStack>
  );
  return (
    <YStack gap="2" backgroundColor={brand.calce} borderRadius="3" padding="3" borderWidth={1} borderColor={brand.filetto}>
      <Text fontFamily="heading" fontWeight="800" fontSize={18} color={brand.grafite}>
        Prima di accettare
      </Text>
      {row("Con", quote.businessName)}
      {row("Quando", dateText)}
      {priceText ? row("Prezzo", `${priceText} · ${quotePriceTaxNote(quote.chargesVat ?? null)}`) : null}
      {showPaymentLine ? row("Pagamento", jobPaymentChoiceCopy(payment, quote.depositPercent, true).title) : null}
      {alreadyLate ? (
        <Text fontSize={16} fontWeight="600" color={brand.urgenza}>
          Mancano meno di {cancellationNoticeLabel(quote.cancellationNoticeHours)} all&apos;appuntamento, il preavviso chiesto per annullare.{" "}
          {keepsDeposit
            ? "Se poi annulli, l'acconto resta al professionista."
            : "Se poi annulli non paghi niente, ma il professionista vede che hai annullato all'ultimo."}
        </Text>
      ) : null}
      <Text fontSize={16} color={brand.grafite70}>
        Accettando, {quote.businessName} vedrà il tuo telefono e l&apos;indirizzo del lavoro.
      </Text>
      {/* Chi esegue il lavoro e recesso (collaudo M-02): il contratto è con il professionista. */}
      <Text fontSize={13} color={brand.grafite70}>
        {executor
          ? `Esegue il lavoro: ${executor.name}${executor.vatNumber ? ` · P.IVA ${executor.vatNumber}` : ""}${executor.seat ? ` · sede a ${executor.seat}` : ""}. `
          : isPrivate
            ? `${TRADER_STATUS_COPY.PRIVATE.note} `
            : ""}
        <Link href="/termini#recesso" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 600 }}>
          Recesso e annullamento
        </Link>
      </Text>
    </YStack>
  );
}
