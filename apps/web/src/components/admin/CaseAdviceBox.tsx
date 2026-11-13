"use client";

import { useCallback, useEffect, useState } from "react";
import { CASE_ADVICE_DECISION_LABEL, moderationGround, type CaseAdvice, type CaseAdviceKind } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { errorMessage } from "@/components/admin/adminUi";

/**
 * Le proposte dell'IA per i casi aperti (docs/changelog/2026-11-13-admin-ia-propone.md),
 * per chiave "<tipo>:<id>". Se l'IA è spenta o non risponde la mappa resta vuota
 * e la pagina funziona come prima.
 */
export function useCaseAdvice(token: string | null) {
  const [byKey, setByKey] = useState<Map<string, CaseAdvice>>(new Map());
  const reload = useCallback(() => {
    if (!token) return;
    apiClient
      .adminCaseAdvice(token)
      .then((overview) => setByKey(new Map(overview.open.map((a) => [`${a.kind}:${a.caseId}`, a]))))
      .catch(() => setByKey(new Map()));
  }, [token]);
  useEffect(reload, [reload]);
  return { get: (kind: CaseAdviceKind, caseId: string) => byKey.get(`${kind}:${caseId}`) ?? null, reload };
}

/**
 * Il punto di vista dell'IA in un caso, con "Approva" e "Modifica" (decisione
 * di Luca del 13/11/2026). "Approva" decide come propone l'IA, con gli stessi
 * servizi dei pulsanti a mano; "Modifica" apre il modulo di sempre già
 * compilato. Nei casi di soldi "Approva" apre la conferma di sempre con la
 * proposta già scritta. Per i messaggi c'è solo la bozza da copiare o da aprire
 * nell'email: il sito non manda risposte da solo.
 */
export function CaseAdviceBox({
  advice,
  token,
  onApproved,
  onModify,
  onApprove,
  noAction,
  replyTo,
}: {
  advice: CaseAdvice;
  token: string;
  onApproved: () => void;
  onModify?: () => void;
  /**
   * Casi di soldi: "Approva" compila il modulo della pagina e apre la sua
   * conferma (chi riceve cosa, quanto), invece di decidere subito.
   */
  onApprove?: () => void;
  /** Quando la proposta è di non fare nulla: la frase al posto dei pulsanti. */
  noAction?: string;
  /** Solo per i messaggi: l'email a cui rispondere. */
  replyTo?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const ground = moderationGround(advice.ground);
  const isMessage = advice.kind === "CONTACT_MESSAGE";

  const isMoney = advice.kind === "JOB_ISSUE" || advice.kind === "JOB_ISSUE_APPEAL" || advice.kind === "REFUND" || advice.kind === "DISPUTE" || advice.kind === "BANK_DISPUTE" || advice.kind === "UNPAID_BALANCE";
  const noteLabel = advice.decision === "ASK_INFO" ? "Domanda al professionista" : isMoney ? "Motivazione" : "Cosa legge l'autore";

  async function approve() {
    if (onApprove) {
      onApprove();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiClient.adminApproveCaseAdvice(token, advice.kind, advice.caseId);
      onApproved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!advice.draft) return;
    try {
      await navigator.clipboard.writeText(advice.draft);
      setCopied(true);
    } catch {
      setError("Non riesco a copiare: seleziona il testo a mano.");
    }
  }

  return (
    <YStack gap="2" padding="3" borderRadius={20} borderWidth={1} borderColor={brand.filetto} backgroundColor={brand.calce} role="note" aria-label="Proposta dell'IA">
      <Text fontSize={13} fontWeight="700" color={brand.cianografia}>
        {isMessage ? "Risposta proposta dall'IA" : "L'IA propone"}
      </Text>
      {isMessage ? (
        advice.draft ? (
          <Text fontSize="3" color={brand.grafite} style={{ whiteSpace: "pre-wrap" }}>
            {advice.draft}
          </Text>
        ) : (
          <Text fontWeight="700" color={brand.grafite}>
            Non rispondere
          </Text>
        )
      ) : (
        <Text fontWeight="700" color={brand.grafite}>
          {CASE_ADVICE_DECISION_LABEL[advice.decision]}
        </Text>
      )}
      <Text fontSize="3" color={brand.grafite70}>
        Perché: {advice.reason}
      </Text>
      {ground ? (
        <Text fontSize="3" color={brand.grafite70}>
          Regola: {ground.label}
        </Text>
      ) : null}
      {advice.note ? (
        <Text fontSize="3" color={brand.grafite70}>
          {noteLabel}: “{advice.note}”
        </Text>
      ) : null}
      {error ? (
        <Text color={brand.urgenza} role="alert">
          {error}
        </Text>
      ) : null}
      <XStack gap="2" flexWrap="wrap">
        {isMessage ? (
          advice.draft ? (
            <>
              <Button variant="primary" size="3" onPress={() => void copy()}>
                {copied ? "Copiata" : "Copia la risposta"}
              </Button>
              {replyTo ? (
                <a href={`mailto:${replyTo}?subject=${encodeURIComponent("La tua richiesta")}&body=${encodeURIComponent(advice.draft)}`} style={{ textDecoration: "none" }}>
                  <Button tabIndex={-1} variant="secondary" size="3">
                    Scrivi l&apos;email
                  </Button>
                </a>
              ) : null}
            </>
          ) : null
        ) : noAction ? (
          <Text fontSize="3" color={brand.grafite70}>
            {noAction}
          </Text>
        ) : (
          <>
            <Button variant="primary" size="3" disabled={busy} onPress={() => void approve()}>
              {busy ? "Un momento…" : isMoney ? "Approva la proposta" : "Approva"}
            </Button>
            {onModify ? (
              <Button variant="secondary" size="3" disabled={busy} onPress={onModify}>
                Modifica
              </Button>
            ) : null}
          </>
        )}
      </XStack>
    </YStack>
  );
}
