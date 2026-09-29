"use client";

import {
  JOB_PAYMENT_CHOICE_COPY,
  ONLINE_DEPOSIT_PERCENT,
  onlineDepositEurCents,
  type JobPaymentChoice,
} from "@professionisti/shared";
import { Text, YStack, brand } from "@professionisti/ui";

function eur(cents: number): string {
  return `€${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Scelta del metodo di pagamento accettando un preventivo
 * (docs/CHANGELOG.md §168): online con Stripe (acconto del 20%, saldo a
 * lavoro finito, assistenza e rimborso) o direttamente al professionista
 * (problemi da risolvere con lui, nessun rimborso). Le due differenze devono
 * essere chiare prima di scegliere (decisione dell'utente).
 */
export function PaymentChoice({
  value,
  onChange,
  quoteMaxEurCents,
}: {
  value: JobPaymentChoice;
  onChange: (value: JobPaymentChoice) => void;
  quoteMaxEurCents: number;
}) {
  const options: JobPaymentChoice[] = ["ONLINE", "DIRECT"];
  return (
    <YStack gap="$2" role="radiogroup" aria-label="Come vuoi pagare">
      <Text fontWeight="800" color={brand.grafite}>
        Come vuoi pagare?
      </Text>
      {options.map((option) => {
        const selected = value === option;
        const copy = JOB_PAYMENT_CHOICE_COPY[option];
        return (
          <label
            key={option}
            style={{
              display: "flex",
              gap: 12,
              padding: 12,
              borderRadius: 8,
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
              <Text fontSize="$2" color={brand.grafite70}>
                {copy.body}
              </Text>
              {option === "ONLINE" && quoteMaxEurCents > 0 ? (
                <Text fontSize="$2" fontWeight="700" color={brand.grafite}>
                  Acconto ora ({ONLINE_DEPOSIT_PERCENT}% del massimo del
                  preventivo): {eur(onlineDepositEurCents(quoteMaxEurCents))}
                </Text>
              ) : null}
            </YStack>
          </label>
        );
      })}
    </YStack>
  );
}
