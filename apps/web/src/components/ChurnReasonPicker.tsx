"use client";

import { CHURN_REASON_LABEL, type ChurnReason } from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * "Perché te ne vai?" facoltativo quando si elimina l'account o si annulla
 * l'abbonamento (docs/CHANGELOG.md §372): solo voci fisse, mai testo libero,
 * contate per giorno senza sapere chi le ha scelte. Un secondo tocco toglie
 * la scelta. Pulsanti veri: Invio e spazio funzionano da tastiera.
 */
export function ChurnReasonPicker({
  reasons,
  value,
  onChange,
}: {
  reasons: readonly ChurnReason[];
  value: ChurnReason | null;
  onChange: (reason: ChurnReason | null) => void;
}) {
  return (
    <YStack gap="$2">
      <Text fontSize={14} color={brand.grafite70} id="churn-reason-label">
        Perché? Facoltativo, ci aiuta a migliorare.
      </Text>
      <XStack gap="$2" flexWrap="wrap" role="radiogroup" aria-labelledby="churn-reason-label">
        {reasons.map((reason) => {
          const selected = value === reason;
          return (
            <button
              key={reason}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? null : reason)}
              style={{
                minHeight: 40,
                padding: "0 14px",
                borderRadius: 999,
                border: `1px solid ${selected ? brand.cianografiaPieno : brand.filetto}`,
                background: selected ? brand.cianografiaPieno : "white",
                color: selected ? "white" : brand.grafite,
                fontSize: 14,
                fontWeight: 600,
                fontFamily: "inherit",
                cursor: "pointer",
              }}
            >
              {CHURN_REASON_LABEL[reason]}
            </button>
          );
        })}
      </XStack>
    </YStack>
  );
}
