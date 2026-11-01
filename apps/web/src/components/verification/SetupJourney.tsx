"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { formatEur, subscriptionTierInfo, taxIdCheckMessage, type MySubscription, type MyVerificationStatus } from "@professionisti/shared";
import { Button, Icon, Surface, Text, XStack, YStack, brand, type IconName } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { loadMyProfessionalProfile } from "@/lib/myProfessionalProfile";
import { useAuth } from "@/lib/AuthContext";
import { CardButton } from "@/components/CardButton";

export type JourneyStepKey = "fiscal" | "plan" | "identity" | "payments";
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

// Scheda "Pagamenti online" dell'area Fisco e pagamenti (docs/changelog/2026-10-28-fisco-e-pagamenti-schede.md):
// prima un'ancora in fondo a Dati fiscali, che resta e rimanda qui.
export const PAYMENTS_ANCHOR = "/dashboard/fiscale/pagamenti";

// Livelli della pagina Abbonamento: su Base "Attiva i mesi gratis" apre il Checkout di Stripe.
const PLAN_HREF = "/dashboard/abbonamento#livelli";

/**
 * Il passo "Piano e carta" (docs/changelog/2026-10-29-piano-in-registrazione.md):
 * la carta per i mesi gratis passa dallo stesso Checkout della pagina
 * Abbonamento. Il passo non compare senza abbonamento leggibile né finché la
 * carta non si può dare (senza Stripe, o prima del lancio senza `LAUNCH_DATE`):
 * altrimenti "Completa il profilo" resterebbe aperto per tutti fino al lancio.
 */
function planStep(sub: MySubscription): JourneyStep | null {
  const base = { key: "plan" as const, icon: "tag" as const, title: "Piano e carta", short: "Piano" };
  const baseInfo = subscriptionTierInfo("BASE");
  if (sub.state === "ACTIVE" || sub.state === "PAST_DUE") {
    const free = sub.freeMonths?.currentMonth != null;
    return { ...base, state: "done", text: free ? `Mesi gratis attivi, poi Base a ${formatEur(baseInfo.priceEurCents)} + IVA al mese.` : `Livello ${subscriptionTierInfo(sub.tier ?? "BASE").label} attivo.` };
  }
  // Prima del lancio senza data, o senza Stripe: la carta non si può ancora dare.
  const available = sub.checkoutAvailable && (sub.state !== "TRIAL" || sub.trialEndsAt !== null);
  if (!available) return null;
  if (sub.state === "TRIAL" && sub.freeMonths) {
    const months = sub.freeMonths.months === 1 ? "1 mese" : `${sub.freeMonths.months} mesi`;
    return {
      ...base,
      state: "current",
      text: `${months} Base gratis, oggi 0 €. Poi Base a ${formatEur(baseInfo.priceEurCents)} + IVA al mese, annulli quando vuoi.`,
      action: { href: PLAN_HREF, label: "Attiva i mesi gratis" },
    };
  }
  return { ...base, state: "current", text: "Scegli il livello: senza abbonamento il profilo resta in pausa.", action: { href: PLAN_HREF, label: "Scegli il piano" } };
}

/** Abbonamento letto per il percorso: null se non leggibile (il passo "Piano e carta" non compare). */
export function useJourneySubscription(token: string | null, reloadKey: unknown = 0): MySubscription | null | undefined {
  const [sub, setSub] = useState<MySubscription | null | undefined>(undefined);
  useEffect(() => {
    if (!token) return;
    apiClient
      .getMySubscription(token)
      .then(setSub)
      .catch(() => setSub(null));
  }, [token, reloadKey]);
  return sub;
}

/**
 * Il percorso per completare il profilo, sempre nello stesso ordine
 * (richiesta dell'utente, docs/CHANGELOG.md §262): piano e carta (subito
 * dopo il profilo, docs/changelog/2026-10-29-piano-in-registrazione.md) →
 * dati fiscali → identità → pagamenti online. Un passo si sblocca solo quando il
 * precedente è fatto (o in verifica), così c'è sempre una sola cosa da fare.
 * La verifica dell'identità sparisce dove non è attiva.
 */
export function setupJourney(status: MyVerificationStatus, stripeVerified: boolean, subscription?: MySubscription | null): JourneyStep[] {
  const fiscalHref = "/dashboard/fiscale";
  const invalid = status.taxIdChecks.filter((check) => check.status === "INVALID");
  const plan = subscription ? planStep(subscription) : null;
  const planReady = !plan || plan.state === "done";
  const fiscalTodo: JourneyStep = !status.fiscalDataComplete
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

  // Una cosa alla volta: i dati fiscali da fare aspettano il piano.
  const fiscal: JourneyStep = fiscalTodo.state === "current" && !planReady ? { ...fiscalTodo, state: "locked", text: "Dopo il piano.", action: undefined } : fiscalTodo;
  const fiscalReady = planReady && (fiscal.state === "done" || fiscal.state === "waiting");
  const steps: JourneyStep[] = plan ? [plan, fiscal] : [fiscal];

  const identity = status.identity;
  let identityStep: JourneyStep | null = null;
  if (status.verified) identityStep = { key: "identity", icon: "id-card", title: "Verifica identità", short: "Identità", state: "done", text: "Puoi rispondere alle richieste di preventivo." };
  else if (identity.available) {
    const base = { key: "identity" as const, icon: "id-card" as const, title: "Verifica identità", short: "Identità" };
    const href = "/dashboard/verifica-identita";
    if (!fiscalReady) identityStep = { ...base, state: "locked", text: planReady ? "Dopo i dati fiscali. Serve per rispondere ai preventivi." : "Dopo il piano. Serve per rispondere ai preventivi." };
    else if (identity.standby) identityStep = { ...base, state: "waiting", text: "Il servizio di verifica non risponde: ti avvisiamo noi appena puoi continuare." };
    else if (identity.renewal && identity.status !== "PROCESSING" && identity.status !== "STARTED")
      identityStep = { ...base, state: "current", text: "Il documento è scaduto: rifai la verifica per riavere il badge.", action: { href, label: "Rinnova la verifica" } };
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
  else if (before.state !== "done" || !fiscalReady)
    steps.push({ ...base, state: "locked", text: !planReady ? "Dopo il piano." : identityStep ? "Dopo la verifica dell'identità." : "Dopo i dati fiscali." });
  else steps.push({ ...base, state: "current", text: "Per farti pagare un acconto online prima del lavoro.", action: { href: PAYMENTS_ANCHOR, label: "Attiva i pagamenti online" } });

  return steps;
}

export const journeyDone = (steps: JourneyStep[]) => steps.every((step) => step.state === "done");
export const journeyCurrent = (steps: JourneyStep[]) => steps.find((step) => step.state === "current") ?? null;

const STATE_STYLE: Record<JourneyStepState, { color: string; background: string }> = {
  done: { color: brand.verificato, background: brand.cianografiaVelo },
  current: { color: "#FFFFFF", background: brand.cianografiaPieno },
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
  usePublishJourney(steps);
  const done = steps.filter((step) => step.state === "done").length;
  return (
    <Surface gap="$4" role="status" aria-label={title}>
      <YStack gap="$2">
        <XStack alignItems="baseline" justifyContent="space-between" gap="$3" flexWrap="wrap">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            {title}
          </Text>
          <Text fontSize={16} fontWeight="700" color={brand.grafite70}>
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
                    <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
                      Facoltativo
                    </Text>
                  ) : null}
                </XStack>
                <Text fontSize={16} color={step.state === "current" && step.action?.label.startsWith("Rifai") ? brand.urgenza : brand.grafite70}>
                  {step.text}
                </Text>
                {active && step.action ? (
                  <Link href={step.action.href} style={{ textDecoration: "none", alignSelf: "flex-start", marginTop: 8 }}>
                    <Button tabIndex={-1} variant="primary">{step.action.label}</Button>
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
  usePublishJourney(steps);
  const index = steps.findIndex((step) => step.key === here);
  if (index < 0) return null;
  return (
    <nav aria-label="Percorso per completare il profilo">
      <Text fontSize={16} fontWeight="700" color={brand.grafite70} marginBottom="$2">
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
export function useSetupJourney(
  token: string | null,
  reloadKey: unknown = 0,
): { steps: JourneyStep[] | null; status: MyVerificationStatus | null; settled: boolean } {
  const [status, setStatus] = useState<MyVerificationStatus | null>(null);
  const [stripeVerified, setStripeVerified] = useState<boolean | null>(null);
  const [subscription, setSubscription] = useState<MySubscription | null | undefined>(undefined);
  // Risposte arrivate (anche con errore): Oggi aspetta questo per non far
  // saltare la colonna di destra quando compare il riquadro (§334).
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!token) return;
    Promise.allSettled([
      apiClient
        .myVerificationStatus(token)
        .then(setStatus)
        .catch(() => setStatus(null)),
      loadMyProfessionalProfile(token)
        .then((profile) => setStripeVerified(profile?.stripeVerified ?? false))
        .catch(() => setStripeVerified(false)),
      apiClient
        .getMySubscription(token)
        .then(setSubscription)
        .catch(() => setSubscription(null)),
    ]).then(() => setSettled(true));
  }, [token, reloadKey]);

  return { steps: status && stripeVerified !== null && subscription !== undefined ? setupJourney(status, stripeVerified, subscription) : null, status, settled };
}

/** "Completa il profilo" in Oggi: sparisce quando è tutto fatto. */
export function SetupJourneyCard({ steps }: { steps: JourneyStep[] | null }) {
  if (!steps || journeyDone(steps)) return null;
  // Manca solo un passo facoltativo (pagamenti online): una riga, non il
  // riquadro intero (richiesta dell'utente, docs/CHANGELOG.md §334).
  const left = steps.filter((step) => step.state !== "done");
  const onlyOptional = left.length === 1 ? left[0] : undefined;
  if (onlyOptional?.optional) return <SetupJourneyCompact steps={steps} step={onlyOptional} />;
  return <SetupJourneyView steps={steps} />;
}

function SetupJourneyCompact({ steps, step }: { steps: JourneyStep[]; step: JourneyStep }) {
  usePublishJourney(steps);
  return (
    <XStack gap="$3" alignItems="center" padding="$4" borderRadius={16} backgroundColor="#FFFFFF" flexWrap="wrap" role="status" aria-label="Completa il profilo">
      {/* Come l'avviso dell'agenda: icona e testo sulla stessa riga, su telefono va a capo solo il pulsante. */}
      <XStack flex={1} minWidth={240} gap="$3" alignItems="center">
        <YStack width={40} height={40} borderRadius={999} alignItems="center" justifyContent="center" backgroundColor={brand.gesso} flexShrink={0} aria-hidden>
          <Icon name={step.icon} size={20} color={brand.grafite70} />
        </YStack>
        <YStack flex={1} minWidth={0} gap={2}>
          <XStack gap="$2" alignItems="center" flexWrap="wrap">
            <Text fontWeight="800" color={brand.grafite}>
              {step.title}
            </Text>
            <Text fontSize={13} fontWeight="700" color={brand.grafite70}>
              Facoltativo
            </Text>
          </XStack>
          <Text fontSize={16} color={brand.grafite70}>
            {step.text}
          </Text>
        </YStack>
      </XStack>
      {step.action ? (
        <Link href={step.action.href} style={{ textDecoration: "none" }}>
          <CardButton>Attiva</CardButton>
        </Link>
      ) : null}
    </XStack>
  );
}

/**
 * Pallino sulle voci di menu del passo da fare adesso (docs/CHANGELOG.md
 * §275, richiesta dell'utente): "Dati fiscali e pagamenti" per i dati fiscali
 * e i pagamenti online, "Verifica identità" per documento e selfie. Il menu
 * legge il percorso una volta e lo tiene aggiornato con quello mostrato dalle
 * pagine dei passi (Oggi, Profilo pubblico, Dati fiscali, Verifica identità),
 * così il pallino sparisce appena il passo è fatto.
 */
const STEP_MENU_HREF: Record<JourneyStepKey, string> = {
  fiscal: "/dashboard/fiscale",
  plan: "/dashboard/abbonamento",
  identity: "/dashboard/verifica-identita",
  // La scheda dei pagamenti: il menu "Fisco e pagamenti" lo riconosce come sua sottopagina (`hasNavAttention`).
  payments: "/dashboard/fiscale/pagamenti",
};
/** Dopo quanto il menu rilegge il percorso cambiando pagina. */
const JOURNEY_STALE_MS = 60_000;

let journeyStore: { token: string; hrefs: string[]; at: number } | null = null;
let journeyLoading: string | null = null;
const journeyListeners = new Set<() => void>();
const NO_HREFS: string[] = [];

function publishJourney(token: string, steps: JourneyStep[]) {
  const hrefs = [...new Set(steps.filter((step) => step.state === "current").map((step) => STEP_MENU_HREF[step.key]))];
  const same = journeyStore?.token === token && journeyStore.hrefs.join() === hrefs.join();
  journeyStore = { token, hrefs: same && journeyStore ? journeyStore.hrefs : hrefs, at: Date.now() };
  if (!same) journeyListeners.forEach((listener) => listener());
}

function usePublishJourney(steps: JourneyStep[]) {
  const { token } = useAuth();
  useEffect(() => {
    if (token) publishJourney(token, steps);
  }, [token, steps]);
}

async function loadJourney(token: string) {
  if (journeyLoading === token) return;
  journeyLoading = token;
  try {
    const [status, profile, subscription] = await Promise.all([
      apiClient.myVerificationStatus(token),
      loadMyProfessionalProfile(token),
      apiClient.getMySubscription(token).catch(() => null),
    ]);
    publishJourney(token, setupJourney(status, profile?.stripeVerified ?? false, subscription));
  } catch {
    // Senza percorso nessun pallino: il menu resta com'era.
  } finally {
    journeyLoading = null;
  }
}

/** Voci di menu con un passo del percorso da fare adesso (solo professionisti). */
export function useJourneyMenuHrefs(token: string | null, enabled: boolean, pathname: string): string[] {
  const hrefs = useSyncExternalStore(
    (listener) => {
      journeyListeners.add(listener);
      return () => journeyListeners.delete(listener);
    },
    () => (enabled && token && journeyStore?.token === token ? journeyStore.hrefs : NO_HREFS),
    () => NO_HREFS,
  );
  useEffect(() => {
    if (!enabled || !token) return;
    if (journeyStore?.token === token && Date.now() - journeyStore.at < JOURNEY_STALE_MS) return;
    void loadJourney(token);
  }, [enabled, token, pathname]);
  return hrefs;
}
