"use client";

import { useState } from "react";
import type { AdminJobIssue } from "@professionisti/api-client";
import {
  JOB_ISSUE_DECISION_TEMPLATES,
  JOB_ISSUE_REFUND_LABEL,
  JOB_ISSUE_REFUND_PERCENTS,
  JOB_ISSUE_SANCTION_LABEL,
  adminPersonName,
  formatEurCents,
  jobIssueSanctionFor,
  type JobIssueRefundPercent,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { errorMessage } from "@/components/admin/adminUi";
import { formatIssueDeadline, isPastDeadline } from "@/lib/leadDeadline";
import { CancelBookingModal } from "@/components/CancelBookingModal";

const textareaStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  minHeight: 70,
  padding: 10,
  borderRadius: 10,
  border: `1px solid ${brand.bordoCampo}`,
  fontSize: 14,
  fontFamily: "inherit",
};

/** Scadenza della fase in corso (docs/CHANGELOG.md §167), in rosso se la decisione è in ritardo. */
export function PhaseDeadline({ row }: { row: AdminJobIssue }) {
  const issue = row.issue;
  if (issue.status === "CHAT") {
    return (
      <Text fontSize={13} color={brand.grafite70}>
        {issue.late
          ? "Segnalata troppo tardi. Se la vedono cliente e professionista: noi non decidiamo e non c'è rimborso."
          : !issue.assisted
          ? "Pagato a mano: se la vedono cliente e professionista, non noi."
          : issue.proRepliedInChat
          ? "Il professionista ha risposto in chat: decide il cliente se passarla a noi."
          : `Il professionista deve rispondere in chat entro ${formatIssueDeadline(issue.chatReplyDueAt)}, poi passa da sola a noi.`}
      </Text>
    );
  }
  if (issue.status !== "OPEN" || !issue.phaseDueAt) return null;
  const late = issue.reviewPhase === "TO_DECIDE" && isPastDeadline(issue.phaseDueAt);
  const text =
    issue.reviewPhase === "AWAITING_EVIDENCE"
      ? `Aspetta la versione del professionista fino a ${formatIssueDeadline(issue.phaseDueAt)}. Poi è accolta da sola.`
      : issue.reviewPhase === "AWAITING_INFO"
        ? `Aspetta le risposte fino a ${formatIssueDeadline(issue.phaseDueAt)}. Poi è accolta da sola.`
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
  // Rimborso a livelli (§267): solo per il lavoro fatto male pagato online; la mancata presentazione rimborsa sempre tutto.
  const [refundPercent, setRefundPercent] = useState<JobIssueRefundPercent>(100);
  const choosesRefund = row.issue.paidOnline && row.issue.type !== "NO_SHOW";
  const nextCount = row.professional.upheldLast30Days + 1;
  const nextSanction = jobIssueSanctionFor(nextCount);
  // Decisione in attesa di conferma nella finestra: cosa succede, a chi, quanto.
  const [confirming, setConfirming] = useState<"UPHELD" | "REJECTED" | null>(null);
  const percent = choosesRefund ? refundPercent : 100;
  const refundEur = (p: number) => (row.issue.paidOnline && row.refundableEurCents ? formatEurCents(Math.round((row.refundableEurCents * p) / 100)) : null);
  const client = row.client.name ?? "il cliente";
  const proName = adminPersonName({ businessName: row.professional.businessName, name: row.professional.personName });
  // Il professionista ha ancora tempo per la sua versione o per le informazioni chieste.
  const waitingForPro = (row.issue.reviewPhase === "AWAITING_EVIDENCE" || row.issue.reviewPhase === "AWAITING_INFO") && Boolean(row.issue.phaseDueAt) && !isPastDeadline(row.issue.phaseDueAt);

  function askConfirm(decision: "UPHELD" | "REJECTED") {
    setError(null);
    if (note.trim().length < 3) {
      setError("Scrivi la motivazione: la leggono cliente e professionista.");
      return;
    }
    setConfirming(decision);
  }

  async function decide(decision: "UPHELD" | "REJECTED") {
    await apiClient.adminResolveJobIssue(token, row.issue.id, {
      decision,
      note: note.trim(),
      ...(decision === "UPHELD" && choosesRefund ? { refundPercent } : {}),
    });
    setConfirming(null);
    onDone();
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
    <YStack gap="2" paddingTop="2" borderTopWidth={1} borderTopColor={brand.filetto}>
      <Text fontWeight="700" color={brand.grafite}>
        Decisione
      </Text>
      <Text fontSize={13} color={brand.grafite70}>
        Esiti standard: sceglilo e ritocca il testo se serve.
      </Text>
      {waitingForPro ? (
        <Text fontSize={13} fontWeight="700" color={brand.grafite}>
          {`Il professionista ha tempo fino a ${formatIssueDeadline(row.issue.phaseDueAt)} per rispondere: decidi prima solo se le prove sono già chiare.`}
        </Text>
      ) : null}
      <XStack gap="2" flexWrap="wrap">
        {JOB_ISSUE_DECISION_TEMPLATES[row.issue.type]
          // "Non ha risposto" solo quando il suo tempo per rispondere è finito (misura "dopo" del riordino).
          .filter((template) => !(template.noReply && waitingForPro))
          .map((template) => (
          <Button key={template.label} variant="secondary" size="2" height={32} onPress={() => setNote(template.note)}>
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
        {`Se la accogli, il professionista riceve meno richieste. Conseguenza: «${JOB_ISSUE_SANCTION_LABEL[nextSanction]}» (${
          nextCount === 1 ? "prima segnalazione accolta in 30 giorni" : `${nextCount}ª segnalazione accolta in 30 giorni`
        }).${row.issue.paidOnline ? ` Pagato sul sito: il cliente riavrà il ${percent}%${refundEur(percent) ? ` (${refundEur(percent)})` : ""}. Paga il professionista.` : ""}`}
      </Text>
      {choosesRefund ? (
        <YStack gap="1">
          <Text fontSize={13} fontWeight="700" color={brand.grafite}>
            Rimborso se la accogli
          </Text>
          <XStack gap="2" flexWrap="wrap" role="radiogroup" aria-label="Rimborso al cliente">
            {JOB_ISSUE_REFUND_PERCENTS.map((percent) => (
              <Button
                key={percent}
                role="radio"
                aria-checked={refundPercent === percent}
                variant={refundPercent === percent ? "primary" : "secondary"}
                size="2"
                height={32}
                onPress={() => setRefundPercent(percent)}
              >
                {refundEur(percent) ? `${JOB_ISSUE_REFUND_LABEL[percent]} · ${refundEur(percent)}` : JOB_ISSUE_REFUND_LABEL[percent]}
              </Button>
            ))}
          </XStack>
        </YStack>
      ) : null}
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      <XStack gap="2" flexWrap="wrap">
        <Button variant="urgent" size="3" height={40} disabled={saving !== null} opacity={saving ? 0.6 : 1} onPress={() => askConfirm("UPHELD")}>
          Accogli la segnalazione
        </Button>
        <Button variant="secondary" size="3" height={40} disabled={saving !== null} opacity={saving ? 0.6 : 1} onPress={() => askConfirm("REJECTED")}>
          Respingi
        </Button>
        {row.issue.reviewPhase !== "AWAITING_INFO" ? (
          <Button variant="ghost" size="3" height={40} disabled={saving !== null} onPress={() => setAsking((v) => !v)}>
            Chiedi altre informazioni
          </Button>
        ) : null}
      </XStack>
      {confirming ? (
        <CancelBookingModal
          onClose={() => setConfirming(null)}
          onCancel={() => decide(confirming)}
          title={confirming === "UPHELD" ? "Accogliere la segnalazione?" : "Respingere la segnalazione?"}
          description={
            confirming === "UPHELD"
              ? `${proName} riceve la conseguenza «${JOB_ISSUE_SANCTION_LABEL[nextSanction]}».${
                  row.issue.paidOnline ? ` ${client} riceve subito il rimborso del ${percent}%${refundEur(percent) ? `, ${refundEur(percent)},` : ""} preso dal conto del professionista.` : ""
                } Cliente e professionista leggono la tua motivazione. Non si torna indietro. Il professionista può solo chiedere di rivederla.`
              : `Nessuna conseguenza per ${proName} e nessun rimborso a ${client}. Cliente e professionista leggono la tua motivazione.`
          }
          showNote={false}
          confirmLabel={confirming === "UPHELD" ? (refundEur(percent) ? `Accogli e rimborsa ${refundEur(percent)}` : "Accogli la segnalazione") : "Respingi la segnalazione"}
          confirmingLabel="Salvataggio..."
          confirmVariant={confirming === "UPHELD" ? "urgent" : "primary"}
        >
          <Text fontSize={14} color={brand.grafite}>{`Motivazione: ${note.trim()}`}</Text>
        </CancelBookingModal>
      ) : null}
      {asking ? (
        <YStack gap="2">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value.slice(0, 1000))}
            placeholder="Cosa serve al professionista (es. foto del lavoro finito, messaggi con il cliente)"
            aria-label="Informazioni da chiedere al professionista"
            style={textareaStyle}
          />
          <Text fontSize={13} color={brand.grafite70}>
            Il professionista ha 72 ore per rispondere. Se non lo fa, la segnalazione è accolta.
          </Text>
          <Button variant="secondary" size="3" height={40} alignSelf="flex-start" disabled={saving !== null} opacity={saving ? 0.6 : 1} onPress={askInfo}>
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
  const [error, setError] = useState<string | null>(null);
  // Decisione in attesa di conferma (misura "dopo" del riordino): come per la segnalazione, non si decide con un solo clic.
  const [confirming, setConfirming] = useState<"ACCEPTED" | "REJECTED" | null>(null);
  const proName = adminPersonName({ businessName: row.professional.businessName, name: row.professional.personName });
  const client = row.client.name ?? "il cliente";

  function askConfirm(decision: "ACCEPTED" | "REJECTED") {
    setError(null);
    if (note.trim().length < 3) {
      setError("Scrivi la motivazione.");
      return;
    }
    setConfirming(decision);
  }

  async function decide(decision: "ACCEPTED" | "REJECTED") {
    await apiClient.adminDecideJobIssueAppeal(token, row.issue.id, { decision, note: note.trim() });
    setConfirming(null);
    onDone();
  }

  if (row.decidedByMe) {
    return (
      <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
        Hai deciso tu questa segnalazione: a rivederla deve essere un altro admin.
      </Text>
    );
  }
  return (
    <YStack gap="2" paddingTop="2" borderTopWidth={1} borderTopColor={brand.filetto}>
      <Text fontWeight="700" color={brand.grafite}>
        Rivedi la decisione
      </Text>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 1000))}
        placeholder="Motivazione, visibile al professionista (e al cliente se accogli)"
        aria-label="Perché decidi così"
        style={textareaStyle}
      />
      <Text fontSize={13} color={brand.grafite70}>
        Se annulli la decisione, tutto torna come prima. Il professionista non ha più la conseguenza.
      </Text>
      {error ? <Text color={brand.urgenza}>{error}</Text> : null}
      <XStack gap="2" flexWrap="wrap">
        <Button variant="secondary" size="3" height={40} onPress={() => askConfirm("ACCEPTED")}>
          Ha ragione: annulla la decisione
        </Button>
        <Button variant="ghost" size="3" height={40} onPress={() => askConfirm("REJECTED")}>
          La decisione resta
        </Button>
      </XStack>
      {confirming ? (
        <CancelBookingModal
          onClose={() => setConfirming(null)}
          onCancel={() => decide(confirming)}
          title={confirming === "ACCEPTED" ? "Annullare la decisione?" : "Confermare la decisione?"}
          description={
            confirming === "ACCEPTED"
              ? `Tutto torna come prima: ${proName} non ha più la conseguenza. ${client} e il professionista leggono la tua motivazione. Non si può annullare.`
              : `La segnalazione resta accolta e la conseguenza per ${proName} resta. Il professionista legge la tua motivazione. Non si può annullare.`
          }
          showNote={false}
          confirmLabel={confirming === "ACCEPTED" ? "Annulla la decisione" : "Conferma la decisione"}
          confirmingLabel="Salvataggio..."
          confirmVariant={confirming === "ACCEPTED" ? "urgent" : "primary"}
        >
          <Text fontSize={14} color={brand.grafite}>{`Motivazione: ${note.trim()}`}</Text>
        </CancelBookingModal>
      ) : null}
    </YStack>
  );
}
