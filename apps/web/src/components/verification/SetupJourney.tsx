"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { taxIdCheckMessage, type MyVerificationStatus } from "@professionisti/shared";
import { Button, Icon, Surface, Text, XStack, YStack, brand, type IconName } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

export type JourneyStepKey = "fiscal" | "identity" | "payments";
export type JourneyStepState = "done" | "waiting" | "current" | "locked";

export type JourneyStep = {
  key: JourneyStepKey;
  icon: IconName;
  title: string;
  /** Etichetta corta per la barra in cima alle pagine dei passi. */
  short: string;
  state: JourneyStepState;
  text: string;
  optional?: boolean;
  /** Solo sul passo da fare adesso: una cosa alla volta. */
  action?: { href: string; label: string };
};

export const PAYMENTS_ANCHOR = "/dashboard/fiscale#pagamenti-online";

/**
 * Il percorso per completare il profilo, sempre nello stesso ordine
 * (richiesta dell'utente, docs/CHANGELOG.md §262): dati fiscali → identità →
 * pagamenti online. Un passo si sblocca solo quando il precedente è fatto (o
 * in verifica), così c'è sempre una sola cosa da fare. La verifica
 * dell'identità sparisce dove non è attiva.
 */
export function setupJourney(status: MyVerificationStatus, stripeVerified: boolean): JourneyStep[] {
  const fiscalHref = "/dashboard/fiscale";
  const invalid = status.taxIdChecks.filter((check) => check.status === "INVALID");
  const fiscal: JourneyStep = !status.fiscalDataComplete
    ? { key: "fiscal", icon: "file-text", title: "Dati fiscali", short: "Dati fiscali", state: "current", text: "Servono per comparire nelle ricerche. Circa 2 minuti.", action: { href: fiscalHref, label: "Compila i dati fiscali" } }
    : status.taxIdState === "TO_FIX"
      ? {
          key: "fiscal",
          icon: "file-text",
          title: "Dati fiscali",
          short: "Dati fiscali",
          state: "current",
          text: invalid.map(taxIdCheckMessage).join(" ") || "Alcuni dati non risultano corretti.",
          action: { href: fiscalHref, label: "Correggi i dati fiscali" },
        }
      : status.taxIdState === "CHECKING"
        ? { key: "fiscal", icon: "file-text", title: "Dati fiscali", short: "Dati fiscali", state: "waiting", text: "Li stiamo verificando. Intanto puoi andare avanti." }
        : { key: "fiscal", icon: "file-text", title: "Dati fiscali", short: "Dati fiscali", state: "done", text: status.publicVisible ? "Compari nelle ricerche." : "Compilati." };

  const fiscalReady = fiscal.state === "done" || fiscal.state === "waiting";
  const steps: JourneyStep[] = [fiscal];

  const identity = status.identity;
  let identityStep: JourneyStep | null = null;
  if (status.verified) identityStep = { key: "identity", icon: "id-card", title: "Verifica identità", short: "Identità", state: "done", text: "Puoi rispondere alle richieste di preventivo." };
  else if (identity.available) {
    const base = { key: "identity" as const, icon: "id-card" as const, title: "Verifica identità", short: "Identità" };
    const href = "/dashboard/verifica-identita";
    if (!fiscalReady) identityStep = { ...base, state: "locked", text: "Dopo i dati fiscali. Serve per rispondere ai preventivi." };
    else if (identity.standby) identityStep = { ...base, state: "waiting", text: "Il servizio di verifica non risponde: ti avvisiamo noi appena puoi continuare." };
    else if (identity.status === "PROCESSING") identityStep = { ...base, state: "waiting", text: "Stiamo controllando documento e selfie: di solito bastano pochi minuti." };
    else if (identity.status === "DECLINED" || identity.status === "EXPIRED")
      identityStep = { ...base, state: "current", text: identity.reason ?? "Non è andata a buon fine: puoi riprovare.", action: { href, label: "Rifai la verifica" } };
    else
      identityStep = {
        ...base,
        state: "current",
        text: identity.status === "STARTED" ? "L'hai iniziata ma non finita." : "Documento e selfie, circa 2 minuti. Serve per rispondere ai preventivi.",
        action: { href, label: identity.status === "STARTED" ? "Finisci la verifica" : "Verifica la tua identità" },
      };
  }
  if (identityStep) steps.push(identityStep);

  const base = { key: "payments" as const, icon: "credit-card" as const, title: "Pagamenti online", short: "Pagamenti", optional: true };
  const before = identityStep ?? fiscal;
  if (stripeVerified) steps.push({ ...base, state: "done", text: "Puoi ricevere acconti e saldi online." });
  else if (before.state !== "done" || !fiscalReady) steps.push({ ...base, state: "locked", text: identityStep ? "Dopo la verifica dell'identità." : "Dopo i dati fiscali." });
  else steps.push({ ...base, state: "current", text: "Per farti pagare un acconto online prima del lavoro.", action: { href: PAYMENTS_ANCHOR, label: "Attiva i pagamenti online" } });

  return steps;
}

export const journeyDone = (steps: JourneyStep[]) => steps.every((step) => step.state === "done");
export const journeyCurrent = (steps: JourneyStep[]) => steps.find((step) => step.state === "current") ?? null;

const STATE_STYLE: Record<JourneyStepState, { color: string; background: string }> = {
  done: { color: brand.verificato, background: brand.cianografiaVelo },
  current: { color: "#FFFFFF", background: brand.cianografia },
  waiting: { color: brand.ottoneScuro, background: brand.ottoneVelo },
  locked: { color: brand.grafite70, background: brand.gesso },
};

function StepMarker({ step, index, size = 36 }: { step: JourneyStep; index: number; size?: number }) {
  const style = STATE_STYLE[step.state];
  const iconSize = Math.round(size / 2.1);
  return (
    <YStack width={size} height={size} borderRadius={999} alignItems="center" justifyContent="center" flexShrink={0} backgroundColor={style.background} aria-hidden>
      {step.state === "done" ? (
        <Icon name="check" size={iconSize} strokeWidth={2.6} color={style.color} />
      ) : step.state === "waiting" ? (
        <Icon name="clock" size={iconSize} strokeWidth={2.2} color={style.color} />
      ) : step.state === "locked" ? (
        <Icon name="lock" size={iconSize - 1} strokeWidth={2.2} color={style.color} />
      ) : (
        <Text fontWeight="800" fontSize={size > 30 ? 15 : 13} color={style.color}>
          {index + 1}
        </Text>
      )}
    </YStack>
  );
}

const STATE_LABEL: Record<JourneyStepState, string> = { done: "Fatto", waiting: "In verifica", current: "Da fare", locked: "Dopo" };

/** Il percorso completo, con l'unico pulsante sul passo da fare adesso (Oggi). */
export function SetupJourneyView({ steps, title = "Completa il profilo" }: { steps: JourneyStep[]; title?: string }) {
  const done = steps.filter((step) => step.state === "done").length;
  return (
    <Surface gap="$4" role="status" aria-label={title}>
      <YStack gap="$2">
        <XStack alignItems="baseline" justifyContent="space-between" gap="$3" flexWrap="wrap">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            {title}
          </Text>
          <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
            {done} di {steps.length} fatti
          </Text>
        </XStack>
        <div className="readiness-bar" aria-hidden="true">
          <span style={{ width: `${(done / steps.length) * 100}%` }} />
        </div>
      </YStack>

      <ol className="journey">
        {steps.map((step, index) => {
          const active = step.state === "current";
          return (
            <li key={step.key} className={`journey-step is-${step.state}`} aria-current={active ? "step" : undefined}>
              <StepMarker step={step} index={index} />
              <YStack flex={1} minWidth={0} gap="$1" paddingTop={6} paddingBottom={index < steps.length - 1 ? "$3" : 0}>
                <XStack gap="$2" alignItems="center" flexWrap="wrap">
                  <Text fontWeight="800" color={step.state === "locked" ? brand.grafite70 : brand.grafite}>
                    {step.title}
                  </Text>
                  <span className="journey-sr">{STATE_LABEL[step.state]}</span>
                  {step.optional ? (
                    <Text fontSize={12} fontWeight="700" color={brand.grafite70}>
                      Facoltativo
                    </Text>
                  ) : null}
                </XStack>
                <Text fontSize={14} color={step.state === "current" && step.action?.label.startsWith("Rifai") ? brand.urgenza : brand.grafite70}>
                  {step.text}
                </Text>
                {active && step.action ? (
                  <Link href={step.action.href} style={{ textDecoration: "none", alignSelf: "flex-start", marginTop: 8 }}>
                    <Button variant="primary">{step.action.label}</Button>
                  </Link>
                ) : null}
              </YStack>
            </li>
          );
        })}
      </ol>
    </Surface>
  );
}

/**
 * Barra "Passo N di 3" in cima alla pagina di un passo (Dati fiscali,
 * Verifica identità): dove sei nel percorso, senza ripetere i dettagli.
 */
export function JourneyProgress({ steps, here }: { steps: JourneyStep[]; here: JourneyStepKey }) {
  const index = steps.findIndex((step) => step.key === here);
  if (index < 0) return null;
  return (
    <nav aria-label="Percorso per completare il profilo">
      <Text fontSize={13} fontWeight="700" color={brand.grafite70} marginBottom="$2">
        Passo {index + 1} di {steps.length}
      </Text>
      <ol className="journey-bar">
        {steps.map((step, i) => (
          <li key={step.key} className={`journey-bar-step is-${step.state}${step.key === here ? " is-here" : ""}`} aria-current={step.key === here ? "step" : undefined}>
            <StepMarker step={step} index={i} size={26} />
            <span>{step.short}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Carica stato e pagamenti e restituisce il percorso (null finché non è pronto). */
export function useSetupJourney(token: string | null, reloadKey: unknown = 0): { steps: JourneyStep[] | null; status: MyVerificationStatus | null } {
  const [status, setStatus] = useState<MyVerificationStatus | null>(null);
  const [stripeVerified, setStripeVerified] = useState<boolean | null>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .myVerificationStatus(token)
      .then(setStatus)
      .catch(() => setStatus(null));
    apiClient
      .getMyProfessionalProfile(token)
      .then((profile) => setStripeVerified(profile?.stripeVerified ?? false))
      .catch(() => setStripeVerified(false));
  }, [token, reloadKey]);

  return { steps: status && stripeVerified !== null ? setupJourney(status, stripeVerified) : null, status };
}

/** "Completa il profilo" in Oggi: sparisce quando è tutto fatto. */
export function SetupJourneyCard({ token }: { token: string }) {
  const { steps } = useSetupJourney(token);
  if (!steps || journeyDone(steps)) return null;
  return <SetupJourneyView steps={steps} />;
}
