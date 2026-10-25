"use client";

import { useState } from "react";
import { REQUEST_WITHDRAW_REASONS, REQUEST_WITHDRAW_REASON_CLIENT_LABEL, type RequestWithdrawReason } from "@professionisti/shared";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { CancelBookingModal } from "@/components/CancelBookingModal";

/**
 * Conferma di "Elimina richiesta" (docs/CHANGELOG.md §339), dal modulo di
 * modifica e dal menu: motivo facoltativo con un tocco, poi "Richiesta
 * eliminata · Annulla" per qualche secondo (RequestDeletedNotice).
 * `stillOpen`: la richiesta è ancora aperta, quindi i professionisti la
 * vedranno ritirata; per una scaduta o annullata non cambia nulla per loro.
 */
export function DeleteRequestModal({
  stillOpen,
  onClose,
  onConfirm,
}: {
  stillOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: RequestWithdrawReason | undefined) => Promise<void>;
}) {
  const [reason, setReason] = useState<RequestWithdrawReason | undefined>(undefined);

  return (
    <CancelBookingModal
      title="Eliminare la richiesta?"
      description={stillOpen ? "Sparirà dal tuo elenco. I professionisti la vedranno come ritirata." : "Sparirà dal tuo elenco."}
      confirmLabel="Elimina richiesta"
      confirmingLabel="Eliminazione..."
      showNote={false}
      onClose={onClose}
      onCancel={() => onConfirm(reason)}
    >
      {stillOpen ? (
        <YStack gap="$2">
          <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
            Perché? (facoltativo)
          </Text>
          <XStack gap="$2" flexWrap="wrap" role="radiogroup" aria-label="Motivo">
            {REQUEST_WITHDRAW_REASONS.map((value) => {
              const selected = reason === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setReason(selected ? undefined : value)}
                  style={{
                    minHeight: 44,
                    padding: "0 16px",
                    borderRadius: 999,
                    border: `1.5px solid ${selected ? brand.grafite : brand.bordoCampo}`,
                    background: selected ? brand.grafite : brand.calce,
                    color: selected ? "white" : brand.grafite,
                    fontFamily: "inherit",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {REQUEST_WITHDRAW_REASON_CLIENT_LABEL[value]}
                </button>
              );
            })}
          </XStack>
        </YStack>
      ) : null}
    </CancelBookingModal>
  );
}
