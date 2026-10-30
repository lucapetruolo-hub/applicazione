"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import type { PayoutIbanView, ProfessionalFiscalProfile } from "@professionisti/api-client";
import type { MyVerificationStatus } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { FiscoArea } from "@/components/fisco/FiscoArea";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";
import { OnlinePaymentsCard } from "@/components/OnlinePaymentsCard";
import { PayoutIbanCard } from "@/components/PayoutIbanCard";
import { ProfileMissingNotice, isProfileMissingError } from "@/components/ProfileMissingNotice";
import { JourneyProgress, journeyCurrent, setupJourney, useJourneySubscription } from "@/components/verification/SetupJourney";

/**
 * Scheda "Pagamenti online" dell'area Fisco e pagamenti
 * (docs/changelog/2026-10-28-fisco-e-pagamenti-schede.md): prima stava in
 * fondo a Dati fiscali (docs/CHANGELOG.md §249). Attivazione con Stripe,
 * IBAN dei bonifici (primo passo, §250) e stato del conto. Si sblocca solo
 * dopo la verifica dell'identità (richiesta dell'utente, §262): prima mostra
 * il passo da fare. Stripe torna qui (`?stripeConnect=completato|refresh`).
 */
export default function OnlinePaymentsPage() {
  return (
    <Suspense fallback={null}>
      <OnlinePaymentsContent />
    </Suspense>
  );
}

function OnlinePaymentsContent() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const stripeReturn = searchParams.get("stripeConnect");

  const [profile, setProfile] = useState<ProfessionalFiscalProfile | null | undefined>(undefined);
  const [profileMissing, setProfileMissing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [verification, setVerification] = useState<MyVerificationStatus | null | undefined>(undefined);
  const subscription = useJourneySubscription(token);
  const [payoutIban, setPayoutIban] = useState<PayoutIbanView | null | undefined>(undefined);
  const [ibanStepOpen, setIbanStepOpen] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [stripeLoading, setStripeLoading] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace("/accedi?redirect=/dashboard/fiscale/pagamenti");
    if (!isLoading && user && !user.isProfessional) router.replace("/dashboard");
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!token) return;
    apiClient
      .myFiscalProfile(token)
      .then((data) => setProfile(data ?? null))
      .catch((err) => {
        if (isProfileMissingError(err)) setProfileMissing(true);
        else setLoadFailed(true);
      });
    apiClient
      .myVerificationStatus(token)
      .then(setVerification)
      .catch(() => setVerification(null));
    apiClient
      .myPayoutIban(token)
      .then(setPayoutIban)
      .catch(() => setPayoutIban(null));
    // Tornati da Stripe (`?stripeConnect=`): i dati si rileggono qui sopra, il parametro non serve più.
  }, [token, loadAttempt, stripeReturn]);

  async function handleStripeConnect() {
    if (!token) return;
    setStripeLoading(true);
    setStripeError(null);
    try {
      const { url } = await apiClient.createStripeConnectLink(token);
      window.location.href = url;
    } catch (e) {
      setStripeError(e instanceof Error ? e.message : "Impossibile avviare l'attivazione dei pagamenti.");
    } finally {
      setStripeLoading(false);
    }
  }

  // Prima l'IBAN, poi Stripe (§250).
  function handleActivate() {
    if (payoutIban === null) setIbanStepOpen(true);
    else void handleStripeConnect();
  }

  // Dashboard Express di Stripe: accrediti, bonifici e IBAN (docs/CHANGELOG.md §238).
  async function handleStripeDashboard() {
    if (!token) return;
    setStripeLoading(true);
    setStripeError(null);
    try {
      const { url } = await apiClient.createStripeDashboardLink(token);
      window.location.href = url;
    } catch (e) {
      setStripeError(e instanceof Error ? e.message : "Impossibile aprire il tuo conto Stripe.");
      setStripeLoading(false);
    }
  }

  if (profileMissing) {
    return <ProfileMissingNotice text="Serve un profilo completo (nome attività, categoria, città) prima di attivare i pagamenti online." />;
  }

  const holderName =
    profile?.entityType === "BUSINESS" ? (profile.businessName ?? "") : [profile?.fiscalFirstName, profile?.fiscalLastName].filter(Boolean).join(" ");
  const steps = verification && subscription !== undefined ? setupJourney(verification, !!profile?.stripeChargesEnabled, subscription) : null;
  const paymentsStep = steps?.find((step) => step.key === "payments") ?? null;
  const nextStep = steps ? journeyCurrent(steps) : null;
  const loading = isLoading || profile === undefined || verification === undefined;

  return (
    <FiscoArea tab="pagamenti" heading="Pagamenti online" maxWidth={640}>
      {loadFailed ? (
        <LoadErrorNotice
          title="Non riusciamo a caricare i tuoi dati"
          onRetry={() => {
            setLoadFailed(false);
            setLoadAttempt((n) => n + 1);
          }}
        />
      ) : loading ? (
        // Stessa altezza del contenuto caricato: niente salto (CLS, docs/CHANGELOG.md §334).
        <YStack gap="$3" aria-busy>
          <YStack height={72} borderRadius="$3" backgroundColor={brand.gesso} />
          <YStack height={160} borderRadius="$3" backgroundColor={brand.gesso} />
        </YStack>
      ) : (
        <>
          {steps ? <JourneyProgress steps={steps} here="payments" /> : null}

          {paymentsStep?.state === "locked" ? (
            // Prima i dati fiscali e l'identità (§262): una cosa alla volta, con il passo da fare.
            <Surface gap="$3">
              <XStack gap="$3" alignItems="center">
                <Icon name="lock" size={20} strokeWidth={2} color={brand.grafite70} />
                <Text flex={1} fontSize={16} color={brand.grafite70}>
                  {paymentsStep.text}
                </Text>
              </XStack>
              {nextStep?.action ? (
                <Link href={nextStep.action.href} style={{ textDecoration: "none", alignSelf: "flex-start" }}>
                  <Button tabIndex={-1} variant="primary">{nextStep.action.label}</Button>
                </Link>
              ) : null}
            </Surface>
          ) : (
            <OnlinePaymentsCard
              active={!!profile?.stripeChargesEnabled}
              started={!!profile?.stripeConnectAccountId}
              requirements={profile?.stripeRequirementsStatus}
              loading={stripeLoading}
              error={stripeError}
              onActivate={handleActivate}
              onOpenStripe={handleStripeDashboard}
              step={
                ibanStepOpen && token && !profile?.stripeChargesEnabled ? (
                  <PayoutIbanCard
                    variant="step"
                    token={token}
                    initial={null}
                    defaultHolderName={holderName}
                    busy={stripeLoading}
                    onCancel={() => setIbanStepOpen(false)}
                    onSaved={(saved) => {
                      // Il passo si chiude: se Stripe non risponde, "Attiva" riprova senza richiedere l'IBAN.
                      setPayoutIban(saved);
                      setIbanStepOpen(false);
                      void handleStripeConnect();
                    }}
                  />
                ) : undefined
              }
            >
              {token && payoutIban !== undefined ? <PayoutIbanCard token={token} initial={payoutIban} defaultHolderName={holderName} onSaved={setPayoutIban} /> : null}
            </OnlinePaymentsCard>
          )}
        </>
      )}
    </FiscoArea>
  );
}
