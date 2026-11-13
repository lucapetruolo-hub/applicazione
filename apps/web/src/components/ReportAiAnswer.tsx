"use client";

import { useState } from "react";
import { PROBLEM_REPORT_LABELS, PROBLEM_REPORT_REASONS, type ProblemReportReason } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

/**
 * "Segnala un errore" sotto la proposta dell'intelligenza artificiale
 * (richiesta di Luca, 13/11/2026, docs/changelog/2026-11-13-segnala-risposta-ia.md):
 * il motivo e una nota facoltativa finiscono in Admin › Mestieri richiesti,
 * solo da leggere. L'IA non impara da sola.
 */
export function ReportAiAnswer({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ProblemReportReason | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  if (state === "sent") {
    return (
      <Text fontSize={13} color={brand.grafite70} role="status">
        Grazie, lo controlliamo.
      </Text>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", color: brand.cianografiaScuro, fontSize: 13, textDecoration: "underline", alignSelf: "flex-start" }}
      >
        Segnala un errore
      </button>
    );
  }

  const send = async () => {
    if (!reason) return;
    setState("sending");
    try {
      await apiClient.reportProblemMatch({ id: reportId, reason, note: note.trim() || undefined });
      setState("sent");
    } catch {
      setState("error");
    }
  };

  return (
    <YStack gap="2" role="group" aria-label="Segnala un errore">
      <Text fontSize={14} fontWeight="600" color={brand.grafite}>
        Cosa non va?
      </Text>
      <XStack gap="2" flexWrap="wrap">
        {PROBLEM_REPORT_REASONS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={reason === value}
            onClick={() => setReason(value)}
            style={{
              borderRadius: 999,
              border: `1px solid ${reason === value ? brand.cianografiaScuro : brand.bordoCampo}`,
              background: reason === value ? brand.cianografiaScuro : "transparent",
              color: reason === value ? "#fff" : brand.grafite,
              padding: "6px 12px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            {PROBLEM_REPORT_LABELS[value]}
          </button>
        ))}
      </XStack>
      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, color: brand.grafite70 }}>
        Vuoi aggiungere qualcosa? (facoltativo, niente numeri o email)
        <input
          value={note}
          maxLength={300}
          onChange={(event) => setNote(event.target.value)}
          style={{ border: `1px solid ${brand.bordoCampo}`, borderRadius: 10, padding: "8px 10px", fontSize: 16 }}
        />
      </label>
      <XStack gap="2" alignItems="center">
        <Button size="3" disabled={!reason || state === "sending"} onPress={send}>
          {state === "sending" ? "Invio…" : "Invia"}
        </Button>
        <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: 0, cursor: "pointer", color: brand.grafite70, fontSize: 14 }}>
          Annulla
        </button>
      </XStack>
      {state === "error" ? (
        <Text fontSize={13} color={brand.urgenza} role="alert">
          Non è partita. Riprova tra poco.
        </Text>
      ) : null}
    </YStack>
  );
}
