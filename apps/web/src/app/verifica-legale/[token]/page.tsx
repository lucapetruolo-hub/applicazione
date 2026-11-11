"use client";

import { Suspense, use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { representativeConsentText, type RepresentativeVerificationView } from "@professionisti/shared";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { AuthCard, AuthPageBackground } from "@/components/AuthPageBackground";
import { AuthIconBadge } from "@/components/AuthStepHeader";
import { apiClient } from "@/lib/apiClient";
import { startExternalRedirectProgress, stopProgress } from "@/lib/navigationProgress";
import { PageLoading } from "@/components/PageLoading";

/** Di ritorno dalla verifica la pagina aspetta l'esito, per al massimo 3 minuti. */
const POLL_MS = 4000;
const POLL_LIMIT_MS = 3 * 60_000;

export default function VerificaLegalePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return (
    <Suspense fallback={<PageLoading variant="form" />}>
      <VerificaLegale token={token} />
    </Suspense>
  );
}

/**
 * Verifica dell'identità del legale rappresentante di un'azienda (collaudo
 * E-03, M-07, docs/changelog/2026-11-02-iscrizione-verifica-professionisti.md):
 * la apre lui dal link che gli manda l'azienda, senza un account, e il
 * consenso al confronto del volto lo dà lui (GDPR art. 9).
 */
function VerificaLegale({ token }: { token: string }) {
  const returned = useSearchParams().get("ritorno") === "1";
  const [state, setState] = useState<RepresentativeVerificationView | null>(null);
  const [loadError, setLoadError] = useState<"invalid" | "retry" | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentAttempt, setConsentAttempt] = useState(0);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollStartedAt = useRef<number | null>(null);

  const load = useCallback(() => {
    apiClient
      .representativeVerificationStatus(token)
      .then((result) => {
        setState(result);
        setLoadError(null);
      })
      .catch((err) => setLoadError((err as { status?: number }).status === 404 ? "invalid" : "retry"));
  }, [token]);

  useEffect(load, [load]);

  const status = state?.identity.status;
  const waiting = !!state && !state.verified && !state.identity.standby && (status === "PROCESSING" || (returned && status === "STARTED"));
  useEffect(() => {
    if (!waiting) return;
    if (pollStartedAt.current === null) pollStartedAt.current = Date.now();
    if (Date.now() - pollStartedAt.current > POLL_LIMIT_MS) return;
    const timer = setTimeout(load, POLL_MS);
    return () => clearTimeout(timer);
  }, [waiting, state, load]);

  async function start() {
    if (!consent && !state?.identity.standby) {
      setConsentAttempt((n) => n + 1);
      return;
    }
    setStarting(true);
    setError(null);
    startExternalRedirectProgress();
    try {
      const { url } = await apiClient.startRepresentativeVerification(token);
      if (url) {
        window.location.href = url;
        return;
      }
      stopProgress();
      load();
    } catch (err) {
      stopProgress();
      setError(err instanceof Error ? err.message : "Non siamo riusciti ad avviare la verifica. Riprova.");
    }
    setStarting(false);
  }

  const title = (text: string) => (
    <Text render="h1" fontFamily="heading" fontWeight="800" fontSize="8" color={brand.inchiostro} textAlign="center" style={{ textWrap: "balance" }}>
      {text}
    </Text>
  );
  const paragraph = (children: React.ReactNode) => (
    <Text fontSize={16} color={brand.grafite70} textAlign="center">
      {children}
    </Text>
  );

  let content: React.ReactNode = null;
  if (loadError) {
    content = (
      <>
        <AuthIconBadge icon="id-card" />
        {title(loadError === "invalid" ? "Questo link non vale più" : "Pagina non caricata")}
        {paragraph(loadError === "invalid" ? "Chiedi all'azienda di mandarti un link nuovo: lo trova in Verifica identità." : "Riprova tra qualche istante: il link è ancora buono.")}
        {loadError === "retry" ? (
          <Button variant="secondary" onPress={load}>
            Riprova
          </Button>
        ) : null}
      </>
    );
  } else if (state?.verified) {
    content = (
      <>
        <AuthIconBadge icon="check" />
        {title("Identità verificata")}
        {paragraph(
          <>
            Grazie, {state.representativeName}. Ora <Text fontWeight="700">{state.businessName}</Text> può mandare preventivi ai clienti. Puoi chiudere questa pagina.
          </>,
        )}
      </>
    );
  } else if (state && !state.identity.available) {
    content = (
      <>
        <AuthIconBadge icon="clock" />
        {title("La verifica non è ancora attiva")}
        {paragraph("Avvisiamo noi l'azienda quando si può fare.")}
      </>
    );
  } else if (state?.identity.standby) {
    content = (
      <>
        <AuthIconBadge icon="clock" />
        {title("Verifica in attesa")}
        {paragraph("Il servizio di verifica non risponde in questo momento. Riprova tra poco con lo stesso link.")}
        <Button variant="secondary" onPress={() => void start()} disabled={starting}>
          {starting ? "Riprovo…" : "Riprova adesso"}
        </Button>
      </>
    );
  } else if (waiting) {
    content = (
      <>
        <AuthIconBadge icon="scan-face" />
        {title("Stiamo controllando documento e selfie")}
        {paragraph("Di solito bastano pochi minuti. Puoi anche chiudere la pagina: l'esito lo riceve l'azienda.")}
      </>
    );
  } else if (state) {
    const retry = status === "DECLINED" || status === "EXPIRED";
    const consentMissing = consentAttempt > 0 && !consent;
    content = (
      <>
        <AuthIconBadge icon="id-card" />
        {title(retry ? "Riprova la verifica" : `Ciao ${state.representativeName}`)}
        {paragraph(
          <>
            <Text fontWeight="700">{state.businessName}</Text> ti ha indicato come legale rappresentante. Per attivare il profilo serve la verifica della
            tua identità: un tuo documento valido e un selfie, circa 2 minuti.
          </>,
        )}
        {retry && state.identity.reason ? (
          <Text fontSize={16} color={brand.urgenza} textAlign="center">
            {state.identity.reason}
          </Text>
        ) : null}
        <label
          className={consentMissing ? "consent-invalid" : undefined}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: 12,
            borderRadius: 20,
            background: consentMissing ? brand.urgenzaVelo : brand.gesso,
            cursor: "pointer",
            border: `2px solid ${consent ? brand.cianografia : consentMissing ? brand.urgenza : "transparent"}`,
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            aria-invalid={consentMissing || undefined}
            style={{ width: 20, height: 20, marginTop: 1, flexShrink: 0, accentColor: brand.cianografia, cursor: "pointer" }}
          />
          <Text fontSize={16} color={brand.grafite} lineHeight="19px" flex={1}>
            {representativeConsentText(state.representativeName)}{" "}
            <Link href="/privacy#verifica-identita" target="_blank" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
              Informativa
            </Link>
          </Text>
        </label>
        <Button variant="primary" width="100%" disabled={starting || (!state.identity.canStart && !retry)} onPress={() => void start()}>
          {starting ? "Apertura…" : retry ? "Riprova la verifica" : "Inizia la verifica"}
        </Button>
        {consentMissing ? (
          <Text fontSize={16} fontWeight="600" color={brand.urgenza} role="alert">
            Spunta il consenso per continuare.
          </Text>
        ) : null}
        {state.identity.blockedReason && !error ? paragraph(state.identity.blockedReason) : null}
        <Text fontSize={13} color={brand.grafite70} textAlign="center">
          La verifica la fa Didit, il nostro fornitore. Foto e selfie restano a Didit: noi teniamo solo l&apos;esito.
        </Text>
      </>
    );
  }

  return (
    <AuthPageBackground>
      <AuthCard maxWidth={460}>
        <YStack gap="4" alignItems="center" minHeight={state || loadError ? undefined : 220}>
          {content}
          {error ? (
            <Text fontSize={16} color={brand.urgenza} textAlign="center" role="alert">
              {error}
            </Text>
          ) : null}
        </YStack>
      </AuthCard>
    </AuthPageBackground>
  );
}
