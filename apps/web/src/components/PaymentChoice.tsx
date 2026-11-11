"use client";

import {
  jobPaymentChoiceCopy,
  paymentChoiceIsOnline,
  quotePaymentSplit,
  quotePaymentSplitLine,
  type JobPaymentChoice,
  UPFRONT_PAYMENT_NOTE,
} from "@professionisti/shared";
import Link from "next/link";
import { Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * Scelta del metodo di pagamento accettando un preventivo
 * (docs/CHANGELOG.md §168): online con Stripe (acconto, saldo a
 * lavoro finito, assistenza e rimborso) o "Diretto al professionista", una
 * riga senza spiegazioni (richiesta esplicita dell'utente, §228).
 *
 * Si apre solo quando i modi sono due o più: come si paga il cliente lo
 * legge già nella scheda del preventivo (`PaymentOffer`, docs/CHANGELOG.md
 * §339).
 *
 * Senza Stripe attivo (`onlineAvailable` falso) resta solo il pagamento
 * diretto, con una riga che spiega che quello online arriverà
 * (docs/CHANGELOG.md §170).
 *
 * Il cliente vede solo i modi offerti dal professionista nel preventivo,
 * con la sua percentuale di acconto (docs/CHANGELOG.md §237).
 */

/** Nomi dei modi nell'elenco della scheda del preventivo, prima di accettare. */
const OFFER_TITLE: Record<JobPaymentChoice, string> = {
  ONLINE: "Con la carta, sul sito",
  MIXED: "Acconto con la carta, il resto direttamente a lui",
  DIRECT: "Direttamente al professionista, in contanti o con bonifico",
};

/** Le cifre di ora e di dopo: un solo conto in `packages/shared` (anche per il PDF del preventivo). */
export const paymentSplit = quotePaymentSplit;
export const paymentSplitLine = quotePaymentSplitLine;

/**
 * Riga "Pagamento" nella scheda del preventivo, prima di accettare
 * (docs/CHANGELOG.md §339, semplificata il 05/11/2026): con un solo modo le
 * cifre di ora e di dopo; con più modi l'elenco, la scelta si fa accettando.
 * Così chi riceve più preventivi li confronta anche su come si paga.
 */
export function PaymentOffer({
  priceTotals,
  onlineAvailable,
  offered,
  depositPercent,
}: {
  priceTotals: { totalMinEurCents: number; totalMaxEurCents: number };
  onlineAvailable: boolean;
  offered: JobPaymentChoice[];
  depositPercent: number;
}) {
  const options = selectablePaymentChoices(offered, onlineAvailable);
  const onlineHidden = !onlineAvailable && offered.some(paymentChoiceIsOnline);
  const only = options.length === 1 ? options[0] : undefined;
  const anyOnline = options.some(paymentChoiceIsOnline);
  return (
    <YStack gap={2} flex={1} minWidth={0}>
      {options.length === 0 ? (
        <Text fontSize={16} color={brand.urgenza}>
          Il professionista accetta solo il pagamento online, che non è ancora attivo: scrivigli dalla chat per accordarvi.
        </Text>
      ) : only ? (
        <Text fontSize={16} fontWeight="600" color={brand.grafite}>
          {paymentSplitLine(only, priceTotals, depositPercent, true)}
        </Text>
      ) : (
        <>
          {/* Più modi: un elenco numerato con "Puoi pagare in N modi", non
              titoli in fila. Prima la spiegazione della carta finiva sotto
              "Direttamente al professionista" e chi legge con fatica capiva il
              contrario (docs/changelog/2026-11-08-prova-persone-simulate.md). */}
          <Text fontSize={16} fontWeight="600" color={brand.grafite}>
            Puoi pagare in {options.length === 2 ? "due" : "tre"} modi:
          </Text>
          {options.map((option, index) => (
            <XStack key={option} gap={8} alignItems="flex-start">
              <Text fontSize={16} fontWeight="700" color={brand.verificato} aria-hidden>
                {index + 1}.
              </Text>
              <YStack flex={1} minWidth={0} gap={2}>
                <Text fontSize={16} fontWeight="600" color={brand.grafite}>
                  {OFFER_TITLE[option]}
                </Text>
                {paymentSplit(option, priceTotals, depositPercent) ? (
                  <Text fontSize={14} color={brand.grafite70}>
                    {paymentSplitLine(option, priceTotals, depositPercent, true)}.
                  </Text>
                ) : null}
              </YStack>
            </XStack>
          ))}
          <Text fontSize={13} color={brand.grafite70}>
            Scegli quando accetti.
            {anyOnline ? " Con la carta il professionista riceve i soldi quando confermi che il lavoro è fatto. " : " "}
            {anyOnline ? (
              <Link href="/termini#pagamenti" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
                Scopri di più
              </Link>
            ) : null}
          </Text>
        </>
      )}
      {anyOnline && only ? (
        <Text fontSize={13} color={brand.grafite70}>
          {depositPercent >= 100 ? UPFRONT_PAYMENT_NOTE : "Con la carta, sul sito. Il professionista riceve i soldi quando confermi che il lavoro è fatto."}{" "}
          <Link href="/termini#pagamenti" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
            Scopri di più
          </Link>
        </Text>
      ) : null}
      {onlineHidden && options.length > 0 ? (
        <Text fontSize={13} color={brand.grafite70}>
          Il pagamento online con carta sarà disponibile a breve.
        </Text>
      ) : null}
    </YStack>
  );
}

/** Modi che il cliente può davvero scegliere: quelli offerti, senza gli online se Stripe non è attivo. */
export function selectablePaymentChoices(offered: JobPaymentChoice[], onlineAvailable: boolean): JobPaymentChoice[] {
  return offered.filter((choice) => onlineAvailable || !paymentChoiceIsOnline(choice));
}
export function PaymentChoice({
  value,
  onChange,
  quoteMinEurCents,
  quoteMaxEurCents,
  onlineAvailable,
  offered,
  depositPercent,
}: {
  value: JobPaymentChoice | null;
  onChange: (value: JobPaymentChoice) => void;
  quoteMinEurCents: number;
  quoteMaxEurCents: number;
  onlineAvailable: boolean;
  /** Modi offerti dal professionista nel preventivo. */
  offered: JobPaymentChoice[];
  /** Percentuale dell'acconto online scelta dal professionista. */
  depositPercent: number;
}) {
  const options = selectablePaymentChoices(offered, onlineAvailable);
  const onlineHidden = !onlineAvailable && offered.some(paymentChoiceIsOnline);
  const totals = { totalMinEurCents: quoteMinEurCents, totalMaxEurCents: quoteMaxEurCents };
  // Le cifre di ora e di dopo, non la percentuale (05/11/2026).
  const depositLine = (option: JobPaymentChoice) =>
    paymentSplit(option, totals, depositPercent) ? (
      <Text fontSize={13} fontWeight="700" color={brand.grafite}>
        {paymentSplitLine(option, totals, depositPercent, false)}
      </Text>
    ) : null;
  return (
    <YStack gap="2" role="radiogroup" aria-label="Come vuoi pagare">
      <Text fontWeight="800" color={brand.grafite}>
        Come vuoi pagare?
      </Text>
      {options.map((option) => {
        const selected = value === option;
        const copy = jobPaymentChoiceCopy(option, depositPercent);
        return (
          <label
            key={option}
            style={{
              display: "flex",
              gap: 12,
              padding: 12,
              borderRadius: 10,
              border: `2px solid ${selected ? brand.verificato : brand.filetto}`,
              background: selected ? "#E9F1EF" : "#fff",
              cursor: "pointer",
              alignItems: "flex-start",
            }}
          >
            <input
              type="radio"
              name="payment-method"
              value={option}
              checked={selected}
              onChange={() => onChange(option)}
              style={{
                marginTop: 4,
                accentColor: brand.verificato,
                flexShrink: 0,
              }}
            />
            <YStack gap={4} flex={1}>
              <Text fontWeight="700" color={brand.grafite}>
                {copy.title}
              </Text>
              {copy.body ? (
                <Text fontSize={13} color={brand.grafite70}>
                  {copy.body}
                </Text>
              ) : null}
              {depositLine(option)}
            </YStack>
          </label>
        );
      })}
      {options.length === 0 ? (
        <Text fontSize={13} color={brand.urgenza}>
          Il professionista accetta solo il pagamento online, che non è ancora attivo: scrivigli dalla chat per accordarvi.
        </Text>
      ) : onlineHidden ? (
        <Text fontSize={13} color={brand.grafite70}>
          Il pagamento online con carta sarà disponibile a breve.
        </Text>
      ) : null}
    </YStack>
  );
}
