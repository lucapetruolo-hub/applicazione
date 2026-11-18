"use client";

import {
  paymentChoiceIsOnline,
  quotePaymentShortLine,
  quotePaymentSplit,
  quotePaymentSplitLine,
  type JobPaymentChoice,
} from "@professionisti/shared";
import { Badge, Text, XStack, YStack, brand } from "@professionisti/ui";

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

/** Nomi dei modi nella scelta "Come vuoi pagare?", più corti: le cifre stanno sotto. */
const CHOICE_TITLE: Record<JobPaymentChoice, string> = {
  ONLINE: "Con la carta, sul sito",
  MIXED: "Acconto con la carta, il resto a lui",
  DIRECT: "Diretto al professionista",
};

/** Le cifre di ora e di dopo: un solo conto in `packages/shared` (anche per il PDF del preventivo). */
export const paymentSplit = quotePaymentSplit;
export const paymentSplitLine = quotePaymentSplitLine;

/**
 * Riga "Pagamento" nella scheda del preventivo, prima di accettare
 * (docs/CHANGELOG.md §339, semplificata il 05/11/2026 e il 18/11/2026): un
 * modo per riga, con le cifre in mezza riga. Le spiegazioni (quando arrivano
 * i soldi al professionista, cosa succede annullando) le dice una volta sola
 * la finestra "Accetta il preventivo"
 * (docs/changelog/2026-11-18-accettare-il-preventivo.md). Così chi riceve più
 * preventivi li confronta anche su come si paga, senza leggere un paragrafo.
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
  return (
    <YStack gap="2" flex={1} minWidth={0}>
      {options.length === 0 ? (
        <Text fontSize={16} fontWeight="600" color={brand.ottoneScuro}>
          Il professionista accetta solo il pagamento online, che non è ancora attivo: scrivigli dalla chat per accordarvi.
        </Text>
      ) : (
        options.map((option) => {
          const short = quotePaymentShortLine(option, priceTotals, depositPercent);
          return (
            <YStack key={option} gap={2}>
              <Text fontSize={16} fontWeight="600" color={brand.grafite}>
                {OFFER_TITLE[option]}
              </Text>
              {short ? (
                <Text fontSize={14} color={brand.grafite70}>
                  {short}
                </Text>
              ) : null}
            </YStack>
          );
        })
      )}
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
/**
 * "Come vuoi pagare?" nella finestra "Accetta il preventivo"
 * (docs/changelog/2026-11-18-accettare-il-preventivo.md): una riga per modo,
 * le cifre in mezza riga, "Consigliato" come etichetta e non tra parentesi.
 * Il diretto resta una riga sola (richiesta di Luca, §228). Le cifre complete
 * e quando arrivano i soldi al professionista li dice il riepilogo sotto, una
 * volta sola.
 */
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
  const recommend = options.length > 1;
  return (
    <YStack gap="2" role="radiogroup" aria-label="Come vuoi pagare">
      <Text fontWeight="800" fontSize={16} color={brand.grafite}>
        Come vuoi pagare?
      </Text>
      {options.map((option) => {
        const selected = value === option;
        const short = quotePaymentShortLine(option, totals, depositPercent);
        return (
          <label
            key={option}
            style={{
              display: "flex",
              gap: 12,
              padding: "12px 14px",
              borderRadius: 10,
              border: `2px solid ${selected ? brand.verificato : brand.filetto}`,
              background: selected ? "#E8F2F2" : "#fff",
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
            <YStack gap={2} flex={1} minWidth={0}>
              <XStack gap="2" alignItems="center" flexWrap="wrap">
                <Text fontWeight="700" fontSize={16} color={brand.grafite}>
                  {CHOICE_TITLE[option]}
                </Text>
                {recommend && option === "ONLINE" ? <Badge variant="verificato">Consigliato</Badge> : null}
              </XStack>
              {short ? (
                <Text fontSize={14} color={brand.grafite70}>
                  {short}
                </Text>
              ) : null}
            </YStack>
          </label>
        );
      })}
      {options.length === 0 ? (
        <Text fontSize={13} fontWeight="600" color={brand.ottoneScuro}>
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
