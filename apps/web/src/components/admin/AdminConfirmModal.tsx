"use client";

import { useState } from "react";
import { ADMIN_ACTION_REASON_MIN } from "@professionisti/shared";
import { CancelBookingModal } from "@/components/CancelBookingModal";

/**
 * Finestra unica per le azioni pericolose dell'admin (PR Protezioni,
 * docs/changelog/2026-11-02-admin-protezioni.md): dice cosa succede prima del
 * clic. Con `reasonLabel` il motivo è obbligatorio e finisce nel registro
 * azioni. Stessa finestra di "Va bene così" e degli annullamenti.
 */
export function AdminConfirmModal({
  title,
  description,
  confirmLabel,
  reasonLabel,
  reasonPlaceholder,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  onClose: () => void;
  onConfirm: (reason: string | undefined) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  async function submit() {
    if (reasonLabel && reason.trim().length < ADMIN_ACTION_REASON_MIN) throw new Error(`Scrivi il motivo (almeno ${ADMIN_ACTION_REASON_MIN} caratteri).`);
    await onConfirm(reasonLabel ? reason.trim() : undefined);
  }
  return (
    <CancelBookingModal
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      confirmingLabel="Un momento..."
      backLabel="Annulla"
      showNote={false}
      onClose={onClose}
      onCancel={submit}
    >
      {reasonLabel ? (
        <label className="admin-field">
          <span>{reasonLabel}</span>
          <textarea className="admin-input admin-textarea" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={reasonPlaceholder} />
        </label>
      ) : null}
    </CancelBookingModal>
  );
}
