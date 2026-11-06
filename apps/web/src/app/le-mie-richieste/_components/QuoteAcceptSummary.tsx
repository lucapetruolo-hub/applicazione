"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { paymentSplit } from "@/components/PaymentChoice";
import type { ClientGuidedRequest } from "@professionisti/api-client";
import {
  TRADER_STATUS_COPY,
  cancellationNoticeLabel,
  formatEurCents,
  formatServicePriceRange,
  isLateCancellation,
  jobPaymentChoiceCopy,
  paymentChoiceIsOnline,
  quotePriceTaxNote,
  UPFRONT_PAYMENT_NOTE,
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
 * Dal 05/11/2026 in cifre quanto si paga ora e quanto a lavoro finito, al
 * posto della ripetizione di prezzo e modo di pagamento
 * (docs/changelog/2026-11-05-scheda-preventivo-semplice.md).
 */
export function QuoteAcceptSummary({
  quote,
  dateText,
  priceTotals,
  payment,
  onlinePayments,
  children,
}: {
  quote: ClientGuidedRequest["quotes"][number];
  dateText: string;
  priceTotals: { totalMinEurCents: number; totalMaxEurCents: number };
  payment: JobPaymentChoice;
  onlinePayments: boolean;
  /** Richiesta della fattura, chiesta qui e non prima di decidere (05/11/2026). */
  children?: ReactNode;
}) {
  const hasPrice = priceTotals.totalMinEurCents > 0 || priceTotals.totalMaxEurCents > 0;
  const priceText = hasPrice ? formatServicePriceRange(priceTotals.totalMinEurCents, priceTotals.totalMaxEurCents) : null;
  const alreadyLate = isLateCancellation(quote.estimatedStartDate, quote.cancellationNoticeHours);
  const keepsDeposit = quote.lateCancelKeepsDeposit && onlinePayments && paymentChoiceIsOnline(payment);
  const executor = quote.executor ?? null;
  const isPrivate = quote.professionalKind === "PRIVATE";
  const split = paymentSplit(payment, priceTotals, quote.depositPercent);
  const taxNote = quotePriceTaxNote(quote.chargesVat ?? null);
  // Una riga del riquadro: a sinistra cosa e quando, a destra la cifra.
  const line = (label: string, hint: string | null, amount: string, strong = false) => (
    <XStack justifyContent="space-between" alignItems="baseline" gap="3">
      <YStack flex={1} minWidth={0}>
        <Text fontSize={16} fontWeight={strong ? "700" : "400"} color={brand.grafite}>
          {label}
        </Text>
        {hint ? (
          <Text fontSize={13} color={brand.grafite70}>
            {hint}
          </Text>
        ) : null}
      </YStack>
      <Text fontSize={strong ? 24 : 18} fontWeight="800" color={strong ? brand.cianografiaScuro : brand.grafite} whiteSpace="nowrap">
        {amount}
      </Text>
    </XStack>
  );
  return (
    <YStack gap="3" backgroundColor={brand.calce} borderRadius="3" padding="3" borderWidth={1} borderColor={brand.filetto}>
      <YStack gap={2}>
        <Text fontFamily="heading" fontWeight="800" fontSize={18} color={brand.grafite}>
          Prima di accettare
        </Text>
        <Text fontSize={16} color={brand.grafite}>
          <Text fontWeight="700">{quote.businessName}</Text> · {dateText}
        </Text>
      </YStack>
      {/* Quanto paghi ora e quanto dopo, in cifre (05/11/2026): prima si leggeva solo "acconto del 20%". */}
      {hasPrice && priceText ? (
        <YStack gap="2" borderRadius="3" padding="3" borderWidth={2} borderColor={split ? brand.cianografiaPieno : brand.filetto} data-testid="quote-accept-amounts">
          {split ? (
            <>
              {line("Paghi ora, online", split.restMaxEurCents > 0 ? "Acconto con carta" : "Tutto il prezzo, con carta", formatEurCents(split.nowEurCents), true)}
              {split.restMaxEurCents > 0
                ? line(
                    split.restOnline ? "A lavoro finito, online" : "A lavoro finito, al professionista",
                    split.restOnline ? "Il resto del prezzo" : "Il resto, direttamente a lui",
                    `${split.restIsRange ? "fino a " : ""}${formatEurCents(split.restMaxEurCents)}`,
                  )
                : null}
            </>
          ) : (
            <Text fontSize={16} fontWeight="700" color={brand.grafite}>
              {jobPaymentChoiceCopy(payment, quote.depositPercent, true).title}, a lavoro finito
            </Text>
          )}
          <XStack justifyContent="space-between" alignItems="baseline" gap="3" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="2">
            <Text fontSize={16} color={brand.grafite}>
              Totale <Text fontSize={13} color={brand.grafite70}>· {taxNote}</Text>
            </Text>
            <Text fontSize={16} fontWeight="800" color={brand.grafite} whiteSpace="nowrap">
              {priceText}
            </Text>
          </XStack>
        </YStack>
      ) : (
        <Text fontSize={16} fontWeight="700" color={brand.grafite}>
          {jobPaymentChoiceCopy(payment, quote.depositPercent, true).title}
        </Text>
      )}
      {split ? (
        <Text fontSize={13} color={brand.grafite70}>
          {split.restMaxEurCents === 0 ? `${UPFRONT_PAYMENT_NOTE} ` : "Il professionista riceve i soldi quando confermi che il lavoro è fatto; se qualcosa va storto ti assistiamo noi. "}
          <Link href="/termini#pagamenti" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
            Scopri di più
          </Link>
        </Text>
      ) : null}
      {alreadyLate ? (
        <Text fontSize={16} fontWeight="600" color={brand.urgenza}>
          Mancano meno di {cancellationNoticeLabel(quote.cancellationNoticeHours)} all&apos;appuntamento, il preavviso chiesto per annullare.{" "}
          {keepsDeposit
            ? "Se poi annulli, l'acconto resta al professionista."
            : "Se poi annulli non paghi niente, ma il professionista vede che hai annullato all'ultimo."}
        </Text>
      ) : null}
      <Text fontSize={16} color={brand.grafite}>
        Accettando, {quote.businessName} vedrà il tuo telefono e l&apos;indirizzo del lavoro.
      </Text>
      {children}
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
