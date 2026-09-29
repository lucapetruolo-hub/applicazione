"use client";

import { useState } from "react";
import { JOB_ISSUE_LABEL, JOB_ISSUE_STATUS_LABEL, type JobIssueSummary } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { MediaPreview } from "@/components/MediaPreview";

/**
 * Segnalazione del cliente vista dal professionista (docs/CHANGELOG.md
 * §164): cosa ha scritto il cliente, e finché è in esame un campo per
 * rispondere con la propria versione, che il nostro team legge prima di
 * decidere. Dopo la decisione mostra esito e motivazione.
 */
export function JobIssuePanel({ issue, onRespond }: { issue: JobIssueSummary; onRespond: (response: string) => Promise<void> }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit() {
    setError(null);
    if (draft.trim().length < 3) {
      setError("Scrivi la tua versione.");
      return;
    }
    setIsSaving(true);
    try {
      await onRespond(draft.trim());
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <YStack gap="$2" padding="$3" borderRadius="$3" backgroundColor={brand.urgenzaVelo}>
      <Text fontWeight="800" color={brand.grafite}>
        Il cliente ha segnalato: {JOB_ISSUE_LABEL[issue.type].toLowerCase()} · {JOB_ISSUE_STATUS_LABEL[issue.status]}
      </Text>
      <Text color={brand.grafite}>“{issue.description}”</Text>
      {issue.photoUrls.length > 0 ? (
        <XStack gap="$2" flexWrap="wrap">
          {issue.photoUrls.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" style={{ width: 64, height: 64, borderRadius: 8, overflow: "hidden", display: "block" }}>
              <MediaPreview url={url} />
            </a>
          ))}
        </XStack>
      ) : null}

      {issue.professionalResponse ? (
        <YStack gap={2}>
          <Text fontSize="$2" fontWeight="700" color={brand.grafite}>
            La tua risposta
          </Text>
          <Text fontSize="$2" color={brand.grafite70}>
            {issue.professionalResponse}
          </Text>
        </YStack>
      ) : null}

      {issue.status === "OPEN" ? (
        <YStack gap="$2">
          <Text fontSize="$2" color={brand.grafite70}>
            Il nostro team decide dopo aver letto anche la tua versione.{" "}
            {issue.type === "NO_SHOW" ? "Una mancata presentazione confermata abbassa la tua affidabilità nell'assegnazione delle richieste." : ""}
          </Text>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
            placeholder={issue.professionalResponse ? "Aggiorna la tua risposta" : "Racconta la tua versione"}
            aria-label="La tua versione"
            style={{
              width: "100%",
              boxSizing: "border-box",
              minHeight: 76,
              padding: 10,
              borderRadius: 4,
              border: `1px solid ${brand.filetto}`,
              fontSize: 14,
              fontFamily: "inherit",
              color: brand.grafite,
              background: "#fff",
              resize: "vertical",
            }}
          />
          {error ? (
            <Text fontSize="$2" color={brand.urgenza}>
              {error}
            </Text>
          ) : null}
          <Button variant="secondary" size="$2" height={36} alignSelf="flex-start" onPress={submit} disabled={isSaving} opacity={isSaving ? 0.6 : 1}>
            {isSaving ? "Invio..." : issue.professionalResponse ? "Aggiorna risposta" : "Invia risposta"}
          </Button>
        </YStack>
      ) : issue.resolutionNote ? (
        <Text fontSize="$2" color={brand.grafite}>
          Decisione: {issue.resolutionNote}
        </Text>
      ) : null}
    </YStack>
  );
}
