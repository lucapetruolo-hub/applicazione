"use client";

import {
  jobPaymentChoiceCopy,
  onlineDepositEurCents,
  paymentChoiceIsOnline,
  type JobPaymentChoice,
} from "@professionisti/shared";
import Link from "next/link";
import { Text, YStack, brand } from "@professionisti/ui";

function eur(cents: number): string {
  return `€${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Scelta del metodo di pagamento accettando un preventivo
 * (docs/CHANGELOG.md §168): online con Stripe (acconto, saldo a
 * lavoro finito, assistenza e rimborso) o "Diretto al professionista", una
 * riga senza spiegazioni (richiesta esplicita dell'utente, §228).
 *
 * Si apre solo quando i modi sono due o più: come si paga il cliente lo
 * legge già nella scheda del preventivo (`PaymentOffer`, docs/CHANGELOG.md
 * §337).
 *
 * Senza Stripe attivo (`onlineAvailable` falso) resta solo il pagamento
 * diretto, con una riga che spiega che quello online arriverà
 * (docs/CHANGELOG.md §170).
 *
 * Il cliente vede solo i modi offerti dal professionista nel preventivo,
 * con la sua percentuale di acconto (docs/CHANGELOG.md §237).
 */

/**
 * Riquadro "Pagamento" nella scheda del preventivo, prima di accettare
 * (docs/CHANGELOG.md §337): con un solo modo il modo, la spiegazione e
 * l'acconto; con più modi l'elenco, la scelta si fa accettando. Così chi
 * riceve più preventivi li confronta anche su come si paga.
 */
export function PaymentOffer({
  quoteMaxEurCents,
  onlineAvailable,
  offered,
  depositPercent,
}: {
  quoteMaxEurCents: number;
  onlineAvailable: boolean;
  offered: JobPaymentChoice[];
  depositPercent: number;
}) {
  const options = selectablePaymentChoices(offered, onlineAvailable);
  const onlineHidden = !onlineAvailable && offered.some(paymentChoiceIsOnline);
  const deposit = quoteMaxEurCents > 0 ? eur(onlineDepositEurCents(quoteMaxEurCents, depositPercent)) : null;
  const only = options.length === 1 ? options[0] : undefined;
  const onlyCopy = only ? jobPaymentChoiceCopy(only, depositPercent, true) : null;
  return (
    <YStack backgroundColor={brand.gesso} borderRadius="$3" padding="$3" gap="$1">
      <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
        {options.length > 1 ? "Pagamento, a tua scelta" : "Pagamento"}
      </Text>
      {options.length === 0 ? (
        <Text fontSize={16} color={brand.urgenza}>
          Il professionista accetta solo il pagamento online, che non è ancora attivo: scrivigli dalla chat per accordarvi.
        </Text>
      ) : only && onlyCopy ? (
        <>
          <Text fontSize={16} fontWeight="700" color={brand.grafite}>
            {onlyCopy.title}
          </Text>
          {onlyCopy.body ? (
            <Text fontSize={13} color={brand.grafite70}>
              {onlyCopy.body}
            </Text>
          ) : null}
          {paymentChoiceIsOnline(only) && deposit ? (
            <Text fontSize={13} fontWeight="700" color={brand.grafite}>
              {depositPercent >= 100 ? "Da pagare accettando" : `Acconto accettando (${depositPercent}% del massimo)`}: {deposit}
            </Text>
          ) : null}
        </>
      ) : (
        options.map((option) => (
          <Text key={option} fontSize={16} fontWeight="700" color={brand.grafite}>
            {jobPaymentChoiceCopy(option, depositPercent, true).title}
            {paymentChoiceIsOnline(option) && deposit ? (
              <Text fontSize={13} fontWeight="400" color={brand.grafite70}>
                {" "}
                · {depositPercent >= 100 ? `paghi ${deposit} accettando` : `acconto di ${deposit} accettando`}
              </Text>
            ) : null}
          </Text>
        ))
      )}
      {onlineHidden && options.length > 0 ? (
        <Text fontSize={13} color={brand.grafite70}>
          Il pagamento online con carta sarà disponibile a breve.
        </Text>
      ) : null}
      {options.some(paymentChoiceIsOnline) ? (
        <Link href="/termini#pagamenti" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 600, fontSize: 16 }}>
          Come funziona il pagamento online
        </Link>
      ) : null}
    </YStack>
  );
}

/**
 * Etichetta corta accanto al totale, per confrontare più preventivi a colpo
 * d'occhio (docs/CHANGELOG.md §337). null se non c'è un modo utilizzabile.
 */
export function paymentOfferShortLabel(offered: JobPaymentChoice[], onlineAvailable: boolean): string | null {
  const options = selectablePaymentChoices(offered, onlineAvailable);
  if (options.length === 0) return null;
  if (options.length > 1) return "Online o diretto";
  return options[0] === "DIRECT" ? "Pagamento diretto" : options[0] === "ONLINE" ? "Pagamento online" : "Acconto online";
}

/** Modi che il cliente può davvero scegliere: quelli offerti, senza gli online se Stripe non è attivo. */
export function selectablePaymentChoices(offered: JobPaymentChoice[], onlineAvailable: boolean): JobPaymentChoice[] {
  return offered.filter((choice) => onlineAvailable || !paymentChoiceIsOnline(choice));
}
export function PaymentChoice({
  value,
  onChange,
  quoteMaxEurCents,
  onlineAvailable,
  offered,
  depositPercent,
}: {
  value: JobPaymentChoice;
  onChange: (value: JobPaymentChoice) => void;
  quoteMaxEurCents: number;
  onlineAvailable: boolean;
  /** Modi offerti dal professionista nel preventivo. */
  offered: JobPaymentChoice[];
  /** Percentuale dell'acconto online scelta dal professionista. */
  depositPercent: number;
}) {
  const options = selectablePaymentChoices(offered, onlineAvailable);
  const onlineHidden = !onlineAvailable && offered.some(paymentChoiceIsOnline);
  const depositLine = (option: JobPaymentChoice) =>
    paymentChoiceIsOnline(option) && quoteMaxEurCents > 0 ? (
      <Text fontSize={13} fontWeight="700" color={brand.grafite}>
        {depositPercent >= 100 ? "Da pagare ora (l'intero massimo del preventivo)" : `Acconto ora (${depositPercent}% del massimo del preventivo)`}:{" "}
        {eur(onlineDepositEurCents(quoteMaxEurCents, depositPercent))}
      </Text>
    ) : null;
  return (
    <YStack gap="$2" role="radiogroup" aria-label="Come vuoi pagare">
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
              background: selected ? "#E6F4EC" : "#fff",
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
      {options.some(paymentChoiceIsOnline) ? (
        <Link href="/termini#pagamenti" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 600, fontSize: 16 }}>
          Come funziona il pagamento online
        </Link>
      ) : null}
    </YStack>
  );
}
