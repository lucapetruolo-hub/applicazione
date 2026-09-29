"use client";

import { useState } from "react";
import type { AdminJobIssue } from "@professionisti/api-client";
import { JOB_ISSUE_DECISION_TEMPLATES, JOB_ISSUE_SANCTION_LABEL, jobIssueSanctionFor } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { errorMessage } from "@/components/admin/adminUi";
import { formatIssueDeadline, isPastDeadline } from "@/lib/leadDeadline";

const textareaStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  minHeight: 70,
  padding: 10,
  borderRadius: 8,
  border: `1px solid ${brand.filetto}`,
  fontSize: 14,
  fontFamily: "inherit",
};

/** Scadenza della fase in corso (docs/CHANGELOG.md §167), in rosso se la decisione è in ritardo. */
export function PhaseDeadline({ row }: { row: AdminJobIssue }) {
  const issue = row.issue;
  if (issue.status === "CHAT") {
    return (
      <Text fontSize={13} color={brand.grafite70}>
        {issue.proRepliedInChat
          ? "Il professionista ha risposto in chat: decide il cliente se passarla a noi."
          : `Il professionista deve rispondere in chat entro ${formatIssueDeadline(issue.chatReplyDueAt)}, poi passa da sola a noi.`}
      </Text>
    );
  }
  if (issue.status !== "OPEN" || !issue.phaseDueAt) return null;
  const late = issue.reviewPhase === "TO_DECIDE" && isPastDeadline(issue.phaseDueAt);
  const text =
    issue.reviewPhase === "AWAITING_EVIDENCE"
      ? `In attesa della versione del professionista fino a ${formatIssueDeadline(issue.phaseDueAt)}: poi è accolta automaticamente.`
      : issue.reviewPhase === "AWAITING_INFO"
        ? `In attesa delle informazioni richieste fino a ${formatIssueDeadline(issue.phaseDueAt)}: poi è accolta automaticamente.`
        : late
          ? `Decisione in ritardo: andava presa entro ${formatIssueDeadline(issue.phaseDueAt)}.`
          : `Da decidere entro ${formatIssueDeadline(issue.phaseDueAt)}.`;
  return (
    <Text fontSize={13} fontWeight="700" color={late ? brand.urgenza : brand.grafite}>
      {text}
    </Text>
  );
}

/**
 * Decisione su una segnalazione (§167): esiti standard già scritti da
 * scegliere e ritoccare, così casi uguali ricevono la stessa decisione; la
 * misura che scatterebbe se accolta; la richiesta di informazioni al
 * professionista (72 ore).
 */
export function DecisionForm({ row, token, onDone }: { row: AdminJobIssue; token: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<"UPHELD" | "REJECTED" | "INFO" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const nextCount = row.professional.upheldLast30Days + 1;
  const nextSanction = jobIssueSanctionFor(nextCount);

  async function decide(decision: "UPHELD" | "REJECTED") {
    setError(null);
    if (note.trim().length < 3) {
      setError("Scrivi la motivazione: la leggono cliente e professionista.");
      return;
    }
    setSaving(decision);
    try {
      await apiClient.adminResolveJobIssue(token, row.issue.id, { decision, note: note.trim() });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  async function askInfo() {
    setError(null);
    if (question.trim().length < 5) {
      setError("Scrivi quali informazioni servono.");
      return;
    }
    setSaving("INFO");
    try {
      await apiClient.adminRequestJobIssueInfo(token, row.issue.id, question.trim());
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  return (
    <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
      <Text fontWeight="700" color={brand.grafite}>
        Decisione
      </Text>
      <Text fontSize={13} color={brand.grafite70}>
        Esiti standard: sceglilo e ritocca il testo se serve.
      </Text>
      <XStack gap="$2" flexWrap="wrap">
        {JOB_ISSUE_DECISION_TEMPLATES[row.issue.type].map((template) => (
          <Button key={template.label} variant="secondary" size="$2" height={32} onPress={() => setNote(template.note)}>
            {`${template.decision === "UPHELD" ? "Accolta" : "Respinta"}: ${template.label}`}
          </Button>
        ))}
      </XStack>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 1000))}
        placeholder="Motivazione, visibile a cliente e professionista"
        aria-label="Motivazione della decisione"
        style={textareaStyle}
      />
      <Text fontSize={13} color={brand.grafite70}>
        {`Se la accogli: affidabilità del professionista più bassa nell'assegnazione delle richieste e misura «${JOB_ISSUE_SANCTION_LABEL[nextSanction]}» (${
          nextCount === 1 ? "prima segnalazione accolta in 30 giorni" : `${nextCount}ª segnalazione accolta in 30 giorni`
        }).${row.issue.paidOnline ? " Lavoro pagato sul sito: parte la richiesta di rimborso completo al cliente." : ""}`}
      </Text>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      <XStack gap="$2" flexWrap="wrap">
        <Button variant="urgent" size="$3" height={40} disabled={saving !== null} opacity={saving ? 0.6 : 1} onPress={() => decide("UPHELD")}>
          {saving === "UPHELD" ? "Salvataggio..." : "Accogli la segnalazione"}
        </Button>
        <Button variant="secondary" size="$3" height={40} disabled={saving !== null} opacity={saving ? 0.6 : 1} onPress={() => decide("REJECTED")}>
          {saving === "REJECTED" ? "Salvataggio..." : "Respingi"}
        </Button>
        {row.issue.reviewPhase !== "AWAITING_INFO" ? (
          <Button variant="ghost" size="$3" height={40} disabled={saving !== null} onPress={() => setAsking((v) => !v)}>
            Chiedi altre informazioni
          </Button>
        ) : null}
      </XStack>
      {asking ? (
        <YStack gap="$2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, 1000))}
            placeholder="Cosa serve al professionista (es. foto del lavoro finito, messaggi con il cliente)"
            aria-label="Informazioni da chiedere al professionista"
            style={textareaStyle}
          />
          <Text fontSize={13} color={brand.grafite70}>
            Il professionista ha 72 ore per rispondere, poi la segnalazione è accolta automaticamente.
          </Text>
          <Button variant="secondary" size="$3" height={40} alignSelf="flex-start" disabled={saving !== null} opacity={saving ? 0.6 : 1} onPress={askInfo}>
            {saving === "INFO" ? "Invio..." : "Invia la richiesta"}
          </Button>
        </YStack>
      ) : null}
    </YStack>
  );
}

/** Ricorso del professionista (§167): lo decide un admin diverso da chi ha deciso la segnalazione. */
export function AppealForm({ row, token, onDone }: { row: AdminJobIssue; token: string; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<"ACCEPTED" | "REJECTED" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: "ACCEPTED" | "REJECTED") {
    setError(null);
    if (note.trim().length < 3) {
      setError("Scrivi la motivazione.");
      return;
    }
    setSaving(decision);
    try {
      await apiClient.adminDecideJobIssueAppeal(token, row.issue.id, { decision, note: note.trim() });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  }

  if (row.decidedByMe) {
    return (
      <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
        Hai deciso tu questa segnalazione: il ricorso lo decide un altro admin.
      </Text>
    );
  }
  return (
    <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
      <Text fontWeight="700" color={brand.grafite}>
        Decisione sul ricorso
      </Text>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 1000))}
        placeholder="Motivazione, visibile al professionista (e al cliente se accogli)"
        aria-label="Motivazione sul ricorso"
        style={textareaStyle}
      />
      <Text fontSize={13} color={brand.grafite70}>
        Se accogli il ricorso la segnalazione diventa respinta, l&apos;affidabilità torna com&apos;era e la misura presa viene tolta.
      </Text>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      <XStack gap="$2" flexWrap="wrap">
        <Button variant="secondary" size="$3" height={40} disabled={saving !== null} opacity={saving ? 0.6 : 1} onPress={() => decide("ACCEPTED")}>
          {saving === "ACCEPTED" ? "Salvataggio..." : "Accogli il ricorso"}
        </Button>
        <Button variant="ghost" size="$3" height={40} disabled={saving !== null} opacity={saving ? 0.6 : 1} onPress={() => decide("REJECTED")}>
          {saving === "REJECTED" ? "Salvataggio..." : "Respingi il ricorso"}
        </Button>
      </XStack>
    </YStack>
  );
}
