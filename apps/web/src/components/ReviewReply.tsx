"use client";

import { useState } from "react";
import { Text, XStack, YStack, brand } from "@professionisti/ui";
import { CardButton } from "@/components/CardButton";
import { apiClient } from "@/lib/apiClient";

const MAX_REPLY = 1000;

/**
 * Risposta pubblica del professionista sotto una recensione (decisione di
 * Luca del 30/10/2026): la leggono tutti; il titolare del profilo la scrive o
 * la modifica da qui.
 */
export function ReviewReply({
  reviewId,
  businessName,
  reply: initialReply,
  canEdit,
  token,
  title,
  onSaved,
}: {
  reviewId: string;
  businessName: string;
  reply: string | null;
  canEdit: boolean;
  token: string | null;
  /** Titolo sopra la risposta: di serie "Risposta di <nome>". */
  title?: string;
  onSaved?: (reply: string) => void;
}) {
  const [reply, setReply] = useState(initialReply);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialReply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!token) return;
    if (draft.trim().length < 2) {
      setError("Scrivi la risposta.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.replyToReview(token, reviewId, draft.trim());
      setReply(draft.trim());
      setEditing(false);
      onSaved?.(draft.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <YStack gap="$2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, MAX_REPLY))}
          placeholder="Ringrazia il cliente o spiega la tua versione, con calma: la risposta la leggono tutti."
          aria-label="La tua risposta alla recensione"
          style={{
            width: "100%",
            boxSizing: "border-box",
            minHeight: 80,
            padding: 10,
            borderRadius: 10,
            border: `1px solid ${brand.bordoCampo}`,
            fontSize: 16,
            fontFamily: "inherit",
            color: brand.grafite,
            resize: "vertical",
          }}
        />
        {error ? (
          <Text fontSize={13} color={brand.urgenza}>
            {error}
          </Text>
        ) : null}
        <XStack gap="$2" flexWrap="wrap">
          <CardButton tone="primary" disabled={busy} onPress={save}>
            {busy ? "Salvataggio..." : "Pubblica la risposta"}
          </CardButton>
          <CardButton
            onPress={() => {
              setEditing(false);
              setDraft(reply ?? "");
              setError(null);
            }}
          >
            Annulla
          </CardButton>
        </XStack>
      </YStack>
    );
  }

  return (
    <YStack gap="$1">
      {reply ? (
        <YStack gap={2} paddingLeft="$3" borderLeftWidth={2} borderLeftColor={brand.filetto}>
          <Text fontSize={13} fontWeight="700" color={brand.grafite}>
            {title ?? `Risposta di ${businessName}`}
          </Text>
          <Text fontSize={14} color={brand.grafite70}>
            {reply}
          </Text>
        </YStack>
      ) : null}
      {canEdit ? (
        <Text
          fontSize={13}
          fontWeight="700"
          color={brand.cianografia}
          cursor="pointer"
          alignSelf="flex-start"
          onPress={() => setEditing(true)}
          accessibilityRole="button"
        >
          {reply ? "Modifica la risposta" : "Rispondi"}
        </Text>
      ) : null}
    </YStack>
  );
}
