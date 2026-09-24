"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MyContentReports } from "@professionisti/api-client";
import { CONTENT_REPORT_TARGET_LABEL, moderationActionOwnerText } from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

/**
 * "Segnalazioni e decisioni" (docs/CHANGELOG.md §144): le decisioni sui
 * contenuti dell'utente con misura presa, motivazione e possibilità di
 * contestarle (DSA art. 17 e 20), e l'esito delle segnalazioni che ha fatto
 * (art. 16(5)). Prima la motivazione scritta dall'admin non era visibile da
 * nessuna parte: la notifica diceva solo "segnalazione accolta".
 */
export default function SegnalazioniPage() {
  const { user, token, isLoading } = useAuth();
  const [data, setData] = useState<MyContentReports | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reload() {
    if (!token) return;
    apiClient
      .getMyContentReports(token)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento."));
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi per vedere segnalazioni e decisioni
          </Text>
          <Link href="/accedi?redirect=/segnalazioni" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={760} gap="$6">
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Segnalazioni e decisioni
          </Text>
          <Text color={brand.grafite70}>
            Qui trovi le decisioni prese sui tuoi contenuti dopo una segnalazione, con la motivazione, e l&apos;esito delle segnalazioni che
            hai inviato tu. Chi ha segnalato un tuo contenuto non viene mai indicato.
          </Text>
        </YStack>

        {error ? <Text color={brand.urgenza}>{error}</Text> : null}

        <YStack gap="$3">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Decisioni sui tuoi contenuti
          </Text>
          {data === null && !error ? (
            <Text color={brand.grafite70}>Caricamento…</Text>
          ) : data && data.received.length === 0 ? (
            <Text color={brand.grafite70}>Nessuna decisione sui tuoi contenuti.</Text>
          ) : (
            data?.received.map((decision) => <DecisionCard key={decision.id} decision={decision} token={token} onChanged={reload} />)
          )}
        </YStack>

        <YStack gap="$3">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Le tue segnalazioni
          </Text>
          {data && data.submitted.length === 0 ? (
            <Text color={brand.grafite70}>Non hai inviato segnalazioni.</Text>
          ) : (
            data?.submitted.map((report) => (
              <YStack key={report.id} id={`segnalazione-${report.id}`} gap="$1" padding="$4" borderRadius={radiusDoc} backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto}>
                <XStack justifyContent="space-between" gap="$2" flexWrap="wrap">
                  <Text fontWeight="700" color={brand.grafite}>
                    {CONTENT_REPORT_TARGET_LABEL[report.targetType]}
                  </Text>
                  <Text fontSize="$2" color={brand.grafite70}>
                    Inviata il {formatDate(report.createdAt)}
                  </Text>
                </XStack>
                <Text fontSize="$3" color={brand.grafite70}>
                  Motivo: {report.reason}
                </Text>
                <Text fontSize="$3" fontWeight="700" color={report.status === "RESOLVED" ? brand.cianografia : brand.grafite}>
                  {report.status === "OPEN"
                    ? "In esame: ti avviseremo quando avremo deciso."
                    : report.status === "RESOLVED"
                      ? "Accolta: abbiamo preso provvedimenti sul contenuto."
                      : "Non accolta: il contenuto non viola le regole del sito."}
                </Text>
                {report.resolutionNote ? (
                  <Text fontSize="$3" color={brand.grafite}>
                    Motivazione: {report.resolutionNote}
                  </Text>
                ) : null}
              </YStack>
            ))
          )}
        </YStack>
      </YStack>
    </YStack>
  );
}

function DecisionCard({ decision, token, onChanged }: { decision: MyContentReports["received"][number]; token: string; onChanged: () => void }) {
  const [appealing, setAppealing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitAppeal() {
    setBusy(true);
    setError(null);
    try {
      await apiClient.appealContentReport(token, decision.id, text);
      setAppealing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setBusy(false);
    }
  }

  const appealPending = decision.appealedAt && !decision.appealRejectedAt && !decision.revertedAt;

  return (
    <YStack
      id={`segnalazione-${decision.id}`}
      gap="$2"
      padding="$4"
      borderRadius={radiusDoc}
      backgroundColor={brand.calce}
      borderWidth={1}
      borderColor={decision.revertedAt ? brand.filetto : brand.urgenza}
    >
      <XStack justifyContent="space-between" gap="$2" flexWrap="wrap">
        <Text fontWeight="700" color={brand.grafite}>
          {CONTENT_REPORT_TARGET_LABEL[decision.targetType]}
        </Text>
        <Text fontSize="$2" color={brand.grafite70}>
          Decisione del {decision.resolvedAt ? formatDate(decision.resolvedAt) : "—"}
        </Text>
      </XStack>
      <Text color={brand.grafite} fontWeight="700">
        {decision.revertedAt ? "Misura annullata: il contenuto è di nuovo come prima." : moderationActionOwnerText(decision.action, decision.targetType)}
      </Text>
      <Text fontSize="$3" color={brand.grafite}>
        <Text fontWeight="700">Perché: </Text>
        {decision.resolutionNote ?? "—"}
      </Text>
      <Text fontSize="$3" color={brand.grafite70}>
        Motivo della segnalazione ricevuta: {decision.reason}. La decisione è stata presa da una persona del nostro team, non da un sistema
        automatico.
      </Text>
      {decision.appealedAt ? (
        <Text fontSize="$3" color={brand.grafite70}>
          Hai contestato la decisione il {formatDate(decision.appealedAt)}: “{decision.appealText}”
        </Text>
      ) : null}
      {appealPending ? (
        <Text fontSize="$3" fontWeight="700" color={brand.grafite}>
          Contestazione in esame: ti avviseremo dell&apos;esito.
        </Text>
      ) : null}
      {decision.revertedAt && decision.revertNote ? (
        <Text fontSize="$3" color={brand.grafite}>
          Motivo dell&apos;annullamento: {decision.revertNote}
        </Text>
      ) : null}
      {decision.appealRejectedAt ? (
        <Text fontSize="$3" color={brand.grafite}>
          Contestazione respinta il {formatDate(decision.appealRejectedAt)}: {decision.appealRejectNote}
        </Text>
      ) : null}

      {!decision.appealedAt && !decision.revertedAt ? (
        appealing ? (
          <YStack gap="$2">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Spiega perché ritieni la decisione sbagliata"
              style={{ width: "100%", boxSizing: "border-box", padding: 10, borderRadius: 10, border: `1px solid ${brand.filetto}`, font: "inherit" }}
            />
            {error ? <Text color={brand.urgenza}>{error}</Text> : null}
            <XStack gap="$2" flexWrap="wrap">
              <Button variant="primary" onPress={submitAppeal} disabled={busy || text.trim().length < 10}>
                {busy ? "Invio…" : "Invia contestazione"}
              </Button>
              <Button variant="secondary" onPress={() => setAppealing(false)}>
                Annulla
              </Button>
            </XStack>
          </YStack>
        ) : (
          <XStack>
            <Button variant="secondary" onPress={() => setAppealing(true)}>
              Contesta la decisione
            </Button>
          </XStack>
        )
      ) : null}
      {!decision.revertedAt ? (
        <Text fontSize="$2" color={brand.grafite70}>
          Puoi anche rivolgerti a un organismo di risoluzione extragiudiziale delle controversie o all&apos;autorità giudiziaria.
        </Text>
      ) : null}
    </YStack>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}
