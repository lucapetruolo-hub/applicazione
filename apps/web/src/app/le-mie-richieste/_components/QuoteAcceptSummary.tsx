"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { paymentSplit } from "@/components/PaymentChoice";
import { CancellationTermsLines } from "@/components/CancellationTermsLines";
import type { ClientGuidedRequest } from "@professionisti/api-client";
import {
  TRADER_STATUS_COPY,
  cancellationPhase,
  cancellationTerms,
  formatEurCents,
  formatServicePriceRange,
  jobPaymentChoiceCopy,
  quotePaymentRestText,
  paymentChoiceIsOnline,
  quotePriceTaxNote,
  recurringSummary,
  UPFRONT_PAYMENT_NOTE,
  type JobPaymentChoice,
} from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * Riepilogo prima di accettare un preventivo (collaudo A-07, M-02, A-06,
 * C-08, docs/changelog/2026-11-02-collaudo-accettazione-e-chiusure.md):
 * prima un solo tocco fissava il lavoro e passava i contatti. Dice quanto e
 * come si paga, chi esegue il lavoro (Codice del consumo art. 49), il
 * recesso, che il professionista vedrà telefono e indirizzo e, se
 * l'appuntamento è già dentro il preavviso, cosa succede annullando.
 *
 * Dal 18/11/2026 sta nella finestra "Accetta il preventivo"
 * (docs/changelog/2026-11-18-accettare-il-preventivo.md): con chi e quando
 * lo dice il titolo della finestra, le cifre si leggono una volta sola, ogni
 * frase compare una volta e le righe obbligatorie sono corte, col resto
 * dietro "Scopri di più".
 */
export function QuoteAcceptSummary({
  quote,
  priceTotals,
  payment,
  onlinePayments,
  now,
  children,
}: {
  quote: ClientGuidedRequest["quotes"][number];
  priceTotals: { totalMinEurCents: number; totalMaxEurCents: number };
  payment: JobPaymentChoice;
  onlinePayments: boolean;
  /** Ora aggiornata ogni minuto dalla scheda (docs/changelog/2026-11-13-annullare-pagina-aperta.md). */
  now: Date;
  /** Richiesta della fattura, chiesta qui e non prima di decidere (05/11/2026). */
  children?: ReactNode;
}) {
  const hasPrice = priceTotals.totalMinEurCents > 0 || priceTotals.totalMaxEurCents > 0;
  const priceText = hasPrice ? formatServicePriceRange(priceTotals.totalMinEurCents, priceTotals.totalMaxEurCents) : null;
  const executor = quote.executor ?? null;
  const isPrivate = quote.professionalKind === "PRIVATE";
  const split = paymentSplit(payment, priceTotals, quote.depositPercent);
  const online = onlinePayments && paymentChoiceIsOnline(payment) && !!split && split.nowEurCents > 0;
  const cancelTerms = cancellationTerms({
    phase: cancellationPhase(quote.estimatedStartDate, quote.estimatedEndDate, quote.cancellationNoticeHours, now),
    start: quote.estimatedStartDate,
    hours: quote.cancellationNoticeHours,
    money: !online
      ? { kind: "none" }
      : { kind: quote.lateCancelKeepsDeposit ? "kept" : "refunded", eurCents: split.nowEurCents, full: split.restMaxEurCents === 0 },
    stage: "offer",
    audience: "client",
  });
  const taxNote = quotePriceTaxNote(quote.chargesVat ?? null);
  // Una riga del riquadro: cosa e cifra sulla stessa riga, la spiegazione
  // sotto a tutta larghezza. Prima la colonna del testo si stringeva fino a
  // una lettera per riga (collaudo dell'08/11/2026, E6-01), poi la cifra
  // scendeva da sola sotto la spiegazione (18/11/2026).
  const line = (label: string, hint: string | null, amount: string, strong = false) => (
    <YStack gap={2}>
      <XStack justifyContent="space-between" alignItems="baseline" gap="3">
        <Text fontSize={16} fontWeight={strong ? "700" : "400"} color={brand.grafite} flexShrink={1} minWidth={0}>
          {label}
        </Text>
        <Text fontSize={strong ? 24 : 18} fontWeight="800" color={strong ? brand.cianografiaScuro : brand.grafite} whiteSpace="nowrap" flexShrink={0}>
          {amount}
        </Text>
      </XStack>
      {hint ? (
        <Text fontSize={13} color={brand.grafite70}>
          {hint}
        </Text>
      ) : null}
    </YStack>
  );
  return (
    <YStack gap="3">
      {/* Quanto paghi ora e quanto dopo, in cifre (05/11/2026): prima si leggeva solo "acconto del 20%". */}
      {hasPrice && priceText ? (
        <YStack gap="2" borderRadius="3" padding="3" backgroundColor="white" borderWidth={2} borderColor={split ? brand.cianografiaPieno : brand.filetto} data-testid="quote-accept-amounts">
          {split ? (
            <>
              {line(
                "Paghi ora, con la carta",
                // "Tutto online" con la forbice: adesso il minimo (docs/changelog/2026-11-13-tutto-online-forbice.md).
                split.nowIsMinimum
                  ? "Il prezzo minimo"
                  : split.restMaxEurCents > 0
                    ? "Acconto"
                    : split.restIsRange
                      ? "Il prezzo massimo: se costa meno, la differenza ti torna sulla carta"
                      : "Tutto il prezzo",
                formatEurCents(split.nowEurCents),
                true,
              )}
              {split.restMaxEurCents > 0
                ? line(
                    "A lavoro finito",
                    // Il saldo online parte da solo: prima lo diceva solo la pagina di Stripe (docs/changelog/2026-11-08-prova-persone-simulate.md).
                    split.restOnline
                      ? split.nowIsMinimum
                        ? "Solo se il prezzo finale è più alto, in automatico sulla stessa carta"
                        : "In automatico, sulla stessa carta"
                      : "Direttamente al professionista",
                    quotePaymentRestText(split),
                  )
                : null}
            </>
          ) : (
            <Text fontSize={16} fontWeight="700" color={brand.grafite}>
              Paghi a lavoro finito, direttamente al professionista
            </Text>
          )}
          <XStack justifyContent="space-between" alignItems="baseline" gap="3" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="2">
            <Text fontSize={16} color={brand.grafite}>
              Prezzo <Text fontSize={13} color={brand.grafite70}>· {taxNote}</Text>
            </Text>
            <Text fontSize={16} fontWeight="800" color={brand.grafite} whiteSpace="nowrap">
              {priceText}
            </Text>
          </XStack>
          {/* Una volta sola, dentro il riquadro delle cifre: prima la stessa frase compariva tre volte. */}
          {split ? (
            <Text fontSize={13} color={brand.grafite70}>
              {split.restMaxEurCents === 0 ? `${UPFRONT_PAYMENT_NOTE} ` : "Il professionista riceve i soldi quando confermi che il lavoro è fatto. "}
              <Link href="/termini#pagamenti" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
                Scopri di più
              </Link>
            </Text>
          ) : null}
        </YStack>
      ) : (
        <Text fontSize={16} fontWeight="700" color={brand.grafite}>
          {jobPaymentChoiceCopy(payment, quote.depositPercent, true).title}
        </Text>
      )}
      {/* Le righe da sapere prima dell'impegno, una per argomento. Preavviso e
          acconto (decisioni di Luca dell'11/11,
          docs/changelog/2026-11-11-rosso-solo-errori.md): rosso solo per gli
          errori; ocra per l'acconto non rimborsabile. Frasi da una sola fonte,
          anche a fascia già iniziata (docs/changelog/2026-11-13-annullare-una-fonte.md). */}
      <YStack gap="2">
        <CancellationTermsLines terms={cancelTerms} noticeSize={15} moneySize={15} testId="quote-accept-cancel" />
        {/* Lavoro ricorrente: le visite dopo la prima si pagano come questa (decisione di Luca del 09/11, docs/changelog/2026-11-09-lavori-ricorrenti.md). */}
        {quote.repeatEvery ? (
          <Text fontSize={15} color={brand.grafite} data-testid="quote-accept-recurring">
            <Text fontWeight="700">{recurringSummary(quote.repeatEvery)}.</Text>{" "}
            {paymentChoiceIsOnline(payment) ? "Le visite dopo la prima le paghi a visita terminata, con la stessa carta." : "Le visite dopo la prima le paghi a visita terminata, al professionista."} Puoi saltarne una o
            interrompere quando vuoi.
          </Text>
        ) : null}
        <Text fontSize={15} color={brand.grafite}>
          Accettando, {quote.businessName} vedrà il tuo telefono e l&apos;indirizzo del lavoro.
        </Text>
        {/* Chi esegue il lavoro e recesso (collaudo M-02): il contratto è con il professionista. Per il privato la riga breve, il resto nella pagina del recesso. */}
        <Text fontSize={13} color={brand.grafite70}>
          {executor
            ? `Esegue il lavoro: ${executor.name}${executor.vatNumber ? ` · P.IVA ${executor.vatNumber}` : ""}${executor.seat ? ` · sede a ${executor.seat}` : ""}. `
            : isPrivate
              ? `${TRADER_STATUS_COPY.PRIVATE.short} `
              : ""}
          <Link href="/termini#recesso" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 600 }}>
            Recesso e annullamento
          </Link>
        </Text>
      </YStack>
      {children}
    </YStack>
  );
}
