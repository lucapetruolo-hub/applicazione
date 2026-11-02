"use client";

import { useState } from "react";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { apiClient } from "@/lib/apiClient";

/**
 * "Va bene così" su un account sospetto (docs/changelog/2026-10-30-admin-persone.md):
 * il motivo è obbligatorio e va nel registro azioni. L'account esce da "Cosa
 * fare" e dalla coda della Home finché il controllo non trova un segnale nuovo.
 */
export function SuspiciousDismissModal({ userId, label, token, onClose, onDone }: { userId: string; label: string; token: string; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  async function submit() {
    if (note.trim().length < 10) throw new Error("Scrivi perché va bene così (almeno 10 caratteri).");
    await apiClient.adminDismissSuspiciousUser(token, userId, note.trim());
    onDone();
  }
  return (
    <CancelBookingModal
      title="Va bene così"
      description={`${label} esce da "Cosa fare". Se il controllo del mattino trova un segnale nuovo, torna da solo.`}
      confirmLabel="Va bene così"
      confirmingLabel="Un momento..."
      backLabel="Annulla"
      showNote={false}
      onClose={onClose}
      onCancel={submit}
    >
      <label className="admin-field">
        <span>Perché va bene</span>
        <textarea
          className="admin-input admin-textarea"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Es. marito e moglie, stessa casa; ho controllato le recensioni"
        />
      </label>
    </CancelBookingModal>
  );
}
