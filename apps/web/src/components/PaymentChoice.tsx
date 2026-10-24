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
 * lavoro finito, assistenza e rimborso) o "DIRETTO al professionista", una
 * riga senza spiegazioni (richiesta esplicita dell'utente, §228).
 *
 * Senza Stripe attivo (`onlineAvailable` falso) resta solo il pagamento
 * diretto, con una riga che spiega che quello online arriverà
 * (docs/CHANGELOG.md §170).
 *
 * Il cliente vede solo i modi offerti dal professionista nel preventivo,
 * con la sua percentuale di acconto (docs/CHANGELOG.md §237).
 */

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
              {paymentChoiceIsOnline(option) && quoteMaxEurCents > 0 ? (
                <Text fontSize={13} fontWeight="700" color={brand.grafite}>
                  {depositPercent >= 100 ? "Da pagare ora (l'intero massimo del preventivo)" : `Acconto ora (${depositPercent}% del massimo del preventivo)`}:{" "}
                  {eur(onlineDepositEurCents(quoteMaxEurCents, depositPercent))}
                </Text>
              ) : null}
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
