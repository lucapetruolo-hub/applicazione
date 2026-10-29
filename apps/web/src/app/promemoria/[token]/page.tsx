"use client";

import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { AppointmentReplyAction, AppointmentReplyState } from "@professionisti/shared";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { AuthCard, AuthPageBackground } from "@/components/AuthPageBackground";
import { AuthIconBadge } from "@/components/AuthStepHeader";
import { apiClient } from "@/lib/apiClient";

/** "martedì 14 ottobre alle 09:00": l'ora dell'appuntamento è scritta in UTC (docs/CHANGELOG.md §287). */
function dayAtTime(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  const time = date.toLocaleTimeString("it-IT", { timeZone: "UTC", hour: "2-digit", minute: "2-digit" });
  return `${day} alle ${time}`;
}

function requestHref(state: AppointmentReplyState, changeDate = false): string {
  if (!state.guidedRequestId) return "/le-mie-richieste";
  return `/le-mie-richieste?open=${encodeURIComponent(state.guidedRequestId)}${changeDate ? "&cambiaData=1" : ""}`;
}

export default function PromemoriaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return (
    <Suspense fallback={null}>
      <Promemoria token={token} />
    </Suspense>
  );
}

/**
 * Pulsanti "Ci sarò" e "Non posso più" dell'email del promemoria (Luca,
 * 29/10/2026, docs/changelog/2026-10-28-promemoria-whatsapp.md). Aprire il
 * link non registra nulla: serve un tocco, perché gli antivirus della posta
 * aprono i link da soli. Senza accedere: il link porta l'appuntamento firmato.
 */
function Promemoria({ token }: { token: string }) {
  const chosen = useSearchParams().get("risposta");
  const [state, setState] = useState<AppointmentReplyState | null>(null);
  const [loadError, setLoadError] = useState<"invalid" | "retry" | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    apiClient
      .getAppointmentReply(token)
      .then((result) => {
        if (active) setState(result);
      })
      .catch((err) => {
        if (active) setLoadError((err as { status?: number }).status === 404 ? "invalid" : "retry");
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function send(action: AppointmentReplyAction) {
    setSending(true);
    setError(null);
    try {
      setState(await apiClient.sendAppointmentReply(token, action));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non siamo riusciti a registrare la risposta, riprova.");
    } finally {
      setSending(false);
    }
  }

  const title = (text: string) => (
    <Text tag="h1" fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite} textAlign="center" style={{ textWrap: "balance" }}>
      {text}
    </Text>
  );
  const paragraph = (children: React.ReactNode) => (
    <Text fontSize={16} color={brand.grafite70} textAlign="center">
      {children}
    </Text>
  );
  const quietLink = (label: string, onPress: () => void) => (
    <Text fontSize={16} fontWeight="600" color={brand.grafite} textDecorationLine="underline" cursor="pointer" accessibilityRole="button" onPress={sending ? undefined : onPress}>
      {label}
    </Text>
  );

  let content: React.ReactNode = null;
  if (loadError) {
    content = (
      <>
        <AuthIconBadge icon="calendar" />
        {title(loadError === "invalid" ? "Questo link non vale" : "Pagina non caricata")}
        {paragraph(loadError === "invalid" ? "Trovi i tuoi appuntamenti in Le mie richieste." : "Riprova tra qualche istante: il link è ancora buono.")}
        <Link href="/le-mie-richieste" className="auth-primary-link">
          Le mie richieste
        </Link>
      </>
    );
  } else if (state && !state.upcoming) {
    content = (
      <>
        <AuthIconBadge icon="calendar" />
        {title("Questo appuntamento non è più in programma")}
        {paragraph("Trovi i dettagli nella tua richiesta.")}
        <Link href={requestHref(state)} className="auth-primary-link">
          Apri la richiesta
        </Link>
      </>
    );
  } else if (state?.cantComeAt) {
    content = (
      <>
        <AuthIconBadge icon="calendar" />
        {title(`Abbiamo avvisato ${state.businessName}`)}
        {paragraph("Proponi un'altra data: così l'appuntamento si sposta invece di saltare.")}
        <Link href={requestHref(state, true)} className="auth-primary-link">
          Proponi un&apos;altra data
        </Link>
        {state.depositDeadline ? paragraph(`Se invece annulli entro ${dayAtTime(state.depositDeadline)}, l'acconto ti torna indietro.`) : null}
        {quietLink("Ho sbagliato, ci sarò", () => void send("UNDO_CANT_COME"))}
      </>
    );
  } else if (state?.confirmedAt) {
    content = (
      <>
        <AuthIconBadge icon="check" />
        {title("Grazie!")}
        {paragraph(
          <>
            Abbiamo detto a <Text fontWeight="700">{state.businessName}</Text> che ci sarai {dayAtTime(state.scheduledAt)}.
          </>,
        )}
        {quietLink("Ho sbagliato", () => void send("UNDO_CONFIRM"))}
      </>
    );
  } else if (state) {
    const cantComeFirst = chosen === "non-posso";
    content = (
      <>
        <AuthIconBadge icon="calendar" />
        {title(cantComeFirst ? "Non puoi più esserci?" : "Ci sarai?")}
        {paragraph(
          <>
            Appuntamento con <Text fontWeight="700">{state.businessName}</Text> {dayAtTime(state.scheduledAt)}.
          </>,
        )}
        {state.depositDeadline ? paragraph(`Se non puoi più esserci, annulla entro ${dayAtTime(state.depositDeadline)}: così l'acconto ti torna indietro.`) : null}
        {cantComeFirst ? (
          <>
            <Button variant="primary" width="100%" onPress={() => void send("CANT_COME")} disabled={sending} opacity={sending ? 0.6 : 1}>
              {sending ? "Invio..." : `Avvisa ${state.businessName}`}
            </Button>
            {paragraph("Poi puoi proporgli un'altra data.")}
            {quietLink("Invece ci sarò", () => void send("CONFIRM"))}
          </>
        ) : (
          <>
            <Button variant="primary" width="100%" onPress={() => void send("CONFIRM")} disabled={sending} opacity={sending ? 0.6 : 1}>
              {sending ? "Invio..." : "Sì, ci sarò"}
            </Button>
            {quietLink("Non posso più", () => void send("CANT_COME"))}
          </>
        )}
      </>
    );
  }

  return (
    <AuthPageBackground>
      <AuthCard maxWidth={440}>
        <YStack gap="$4" alignItems="center" minHeight={state || loadError ? undefined : 220}>
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
