"use client";

import { useState } from "react";
import {
  JOB_ISSUE_APPEAL_DAYS,
  JOB_ISSUE_LABEL,
  JOB_ISSUE_SANCTION_LABEL,
  JOB_ISSUE_STATUS_LABEL,
  jobIssueOutcomeText,
  type JobIssueSummary,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { MediaPreview } from "@/components/MediaPreview";
import { formatIssueDeadline } from "@/lib/leadDeadline";

/**
 * Segnalazione del cliente vista dal professionista (docs/CHANGELOG.md
 * §164-§165, §167). Scadenze sul modello Amazon A-Z: 48 ore per rispondere
 * in chat, poi 72 ore per la propria versione quando passa al nostro team e
 * 72 ore per le informazioni che chiediamo — senza risposta la segnalazione
 * è accolta. Dopo una decisione accolta, il ricorso entro 30 giorni.
 */
export function JobIssuePanel({
  issue,
  onRespond,
  onAnswerInfo,
  onAppeal,
  onOpenChat,
}: {
  issue: JobIssueSummary;
  onRespond: (response: string) => Promise<void>;
  onAnswerInfo: (response: string) => Promise<void>;
  onAppeal: (text: string) => Promise<void>;
  /** Apre la chat col cliente: prima fase della segnalazione (§165). */
  onOpenChat?: () => void;
}) {
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

      {issue.professionalResponse ? <Quoted title="La tua versione" text={issue.professionalResponse} /> : null}
      {issue.infoRequestText ? <Quoted title="Informazioni richieste dal nostro team" text={issue.infoRequestText} /> : null}
      {issue.infoResponse ? <Quoted title="La tua risposta" text={issue.infoResponse} /> : null}

      {issue.status === "CHAT" ? (
        <YStack gap="$2">
          <Text fontSize="$2" color={brand.grafite70}>
            {!issue.assisted
              ? "Il cliente ha pagato direttamente: il problema si risolve tra voi, qui in chat, senza il nostro team. Accordo o no, il cliente potrà lasciare la recensione."
              : issue.proRepliedInChat
              ? "Hai risposto al cliente in chat. Se non vi accordate, il cliente può chiedere al nostro team di decidere: in quel caso avrai 72 ore per inviare la tua versione."
              : `Rispondi al cliente in chat entro ${formatIssueDeadline(issue.chatReplyDueAt)} e proponi una soluzione. Se non rispondi, la segnalazione passa da sola al nostro team.`}
          </Text>
          {onOpenChat ? (
            <Button variant="primary" size="$2" height={36} alignSelf="flex-start" onPress={onOpenChat}>
              Apri la chat col cliente
            </Button>
          ) : null}
        </YStack>
      ) : issue.status === "UNRESOLVED" ? (
        <Text fontSize="$2" color={brand.grafite}>
          Il cliente ha indicato che non avete trovato un accordo. Con il pagamento diretto la questione resta tra voi.
        </Text>
      ) : issue.status === "RESOLVED" ? (
        <Text fontSize="$2" color={brand.grafite}>
          Il cliente ha indicato che avete risolto il problema.
        </Text>
      ) : issue.status === "OPEN" && issue.reviewPhase === "AWAITING_INFO" ? (
        <TextForm
          intro={`Il nostro team ti chiede altre informazioni: rispondi entro ${formatIssueDeadline(issue.phaseDueAt)}. Se non rispondi, la segnalazione è accolta.`}
          placeholder="Scrivi le informazioni richieste"
          label="Informazioni richieste"
          submitLabel="Invia le informazioni"
          onSubmit={onAnswerInfo}
        />
      ) : issue.status === "OPEN" ? (
        <TextForm
          intro={
            issue.reviewPhase === "AWAITING_EVIDENCE"
              ? `La segnalazione è passata al nostro team. Invia la tua versione, con quello che può provarla (messaggi, orari, foto), entro ${formatIssueDeadline(issue.phaseDueAt)}: se non rispondi, la segnalazione è accolta automaticamente.`
              : `Il nostro team ha la tua versione e decide entro ${formatIssueDeadline(issue.phaseDueAt)}. Puoi ancora aggiornarla.`
          }
          placeholder={issue.professionalResponse ? "Aggiorna la tua versione" : "Racconta la tua versione"}
          label="La tua versione"
          submitLabel={issue.professionalResponse ? "Aggiorna la versione" : "Invia la versione"}
          onSubmit={onRespond}
        />
      ) : issue.resolutionNote ? (
        <YStack gap="$2">
          <Text fontSize="$2" color={brand.grafite}>
            {issue.appealDecision === "ACCEPTED"
              ? `Ricorso accolto: la segnalazione è respinta e la misura presa è stata tolta. Motivazione: ${issue.appealNote}`
              : jobIssueOutcomeText({
                  type: issue.type,
                  decision: issue.status === "UPHELD" ? "UPHELD" : "REJECTED",
                  note: issue.resolutionNote,
                  audience: "professional",
                  paidOnline: issue.paidOnline,
                  withAppealHint: false,
                })}
          </Text>
          {issue.status === "UPHELD" && issue.sanction ? (
            <Text fontSize="$2" fontWeight="700" color={brand.urgenza}>
              Misura: {JOB_ISSUE_SANCTION_LABEL[issue.sanction]}
            </Text>
          ) : null}
          {issue.appealedAt && !issue.appealDecision ? (
            <Text fontSize="$2" color={brand.grafite70}>
              Hai fatto ricorso: lo esamina una persona del nostro team diversa da chi ha deciso.
            </Text>
          ) : null}
          {issue.appealDecision === "REJECTED" ? (
            <Text fontSize="$2" color={brand.grafite70}>
              Ricorso respinto: la decisione resta valida. Motivazione: {issue.appealNote}
            </Text>
          ) : null}
          {issue.canAppeal ? (
            <TextForm
              intro={`Non sei d'accordo? Puoi fare ricorso entro ${JOB_ISSUE_APPEAL_DAYS} giorni dalla decisione, una sola volta: spiega perché è sbagliata e cosa lo dimostra. Lo esamina una persona diversa del nostro team.`}
              placeholder="Perché la decisione è sbagliata"
              label="Ricorso"
              submitLabel="Invia il ricorso"
              minLength={10}
              onSubmit={onAppeal}
            />
          ) : null}
        </YStack>
      ) : null}
    </YStack>
  );
}

function Quoted({ title, text }: { title: string; text: string }) {
  return (
    <YStack gap={2}>
      <Text fontSize="$2" fontWeight="700" color={brand.grafite}>
        {title}
      </Text>
      <Text fontSize="$2" color={brand.grafite70}>
        {text}
      </Text>
    </YStack>
  );
}

function TextForm({
  intro,
  placeholder,
  label,
  submitLabel,
  minLength = 3,
  onSubmit,
}: {
  intro: string;
  placeholder: string;
  label: string;
  submitLabel: string;
  minLength?: number;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function submit() {
    setError(null);
    if (draft.trim().length < minLength) {
      setError(`Scrivi almeno ${minLength} caratteri.`);
      return;
    }
    setIsSaving(true);
    try {
      await onSubmit(draft.trim());
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <YStack gap="$2">
      <Text fontSize="$2" color={brand.grafite70}>
        {intro}
      </Text>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, 2000))}
        placeholder={placeholder}
        aria-label={label}
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
        {isSaving ? "Invio..." : submitLabel}
      </Button>
    </YStack>
  );
}
