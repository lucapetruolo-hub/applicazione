"use client";

import { useState } from "react";
import { REQUEST_WITHDRAW_REASONS, REQUEST_WITHDRAW_REASON_CLIENT_LABEL, type RequestWithdrawReason } from "@professionisti/shared";
import { Text, YStack, brand } from "@professionisti/ui";
import { CancelBookingModal } from "@/components/CancelBookingModal";

/**
 * Conferma di "Elimina richiesta" (docs/CHANGELOG.md §343), dal modulo di
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
        <YStack gap="$1">
          <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
            Perché? (facoltativo)
          </Text>
          <YStack role="radiogroup" aria-label="Motivo">
            {REQUEST_WITHDRAW_REASONS.map((value) => {
              const selected = reason === value;
              return (
                // Elenco con pallino, non pulsanti (richiesta dell'utente): più leggero, si toglie toccandolo di nuovo.
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setReason(selected ? undefined : value)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    minHeight: 40,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    color: brand.grafite,
                    fontFamily: "inherit",
                    fontSize: 15,
                    fontWeight: selected ? 600 : 400,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0,
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      border: `1.5px solid ${selected ? brand.grafite : brand.bordoCampo}`,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {selected ? <span style={{ width: 10, height: 10, borderRadius: 999, background: brand.grafite }} /> : null}
                  </span>
                  {REQUEST_WITHDRAW_REASON_CLIENT_LABEL[value]}
                </button>
              );
            })}
          </YStack>
        </YStack>
      ) : null}
    </CancelBookingModal>
  );
}
