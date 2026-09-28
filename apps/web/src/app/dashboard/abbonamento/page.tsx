"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SUBSCRIPTION_FEATURES, SUBSCRIPTION_TIERS, subscriptionTierInfo, type MySubscription, type SubscriptionTier } from "@professionisti/shared";
import { Button, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

/**
 * "Abbonamento" del professionista (docs/CHANGELOG.md §161): stato della
 * prova o del livello, lavori accettati nel mese rispetto al limite, scelta
 * del livello (Stripe Checkout). Il mese regalato compare solo dopo che è
 * stato dato, mai prima (decisione dell'utente: è una sorpresa).
 */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

function statusText(sub: MySubscription): { title: string; detail: string } {
  const tierLabel = sub.tier ? subscriptionTierInfo(sub.tier).label : null;
  const trialFuture = sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() > Date.now();
  switch (sub.state) {
    case "TRIAL":
      return {
        title: sub.bonusMonthGranted ? "Mese gratis in regalo" : "Mese di prova gratuito",
        detail: sub.trialEndsAt
          ? `${sub.bonusMonthGranted ? "Ti abbiamo regalato un altro mese: usi" : "Usi"} tutte le funzioni senza limiti di lavori fino al ${formatDate(sub.trialEndsAt)}.`
          : "Usi tutte le funzioni senza limiti di lavori.",
      };
    case "TRIAL_ENDED":
      return {
        title: "Prova gratuita terminata",
        detail: "Scegli il livello che fa per te qui sotto.",
      };
    case "ACTIVE":
      return {
        title: `Livello ${tierLabel}`,
        detail: trialFuture && sub.trialEndsAt
          ? `Il primo addebito parte alla fine della prova, il ${formatDate(sub.trialEndsAt)}. Fino ad allora nessun limite di lavori.`
          : "Abbonamento attivo, si rinnova ogni mese.",
      };
    case "PAST_DUE":
      return { title: `Livello ${tierLabel}: pagamento non riuscito`, detail: "Aggiorna il metodo di pagamento per non interrompere l'abbonamento." };
    case "CANCELED":
      return { title: "Abbonamento disdetto", detail: "Scegli di nuovo un livello quando vuoi." };
  }
}

export default function AbbonamentoPage() {
  return (
    <Suspense fallback={null}>
      <AbbonamentoContent />
    </Suspense>
  );
}

function AbbonamentoContent() {
  const { user, token, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pendingTier, setPendingTier] = useState<SubscriptionTier | null>(null);

  useEffect(() => {
    if (!token || !user?.isProfessional) return;
    let cancelled = false;
    apiClient
      .getMySubscription(token)
      .then((data) => !cancelled && setSub(data))
      .catch((err) => !cancelled && setLoadError(err instanceof Error ? err.message : "Errore imprevisto, riprova."));
    return () => {
      cancelled = true;
    };
  }, [token, user]);

  async function chooseTier(tier: SubscriptionTier) {
    if (!token) return;
    setCheckoutError(null);
    setPendingTier(tier);
    try {
      const { url } = await apiClient.createSubscriptionCheckout(token, tier);
      if (url) window.location.href = url;
      else setCheckoutError("Pagamento non disponibile al momento, riprova più tardi.");
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setPendingTier(null);
    }
  }

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4" gap="$4">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
          Accedi come professionista
        </Text>
        <Link href="/accedi?redirect=/dashboard/abbonamento" style={{ textDecoration: "none" }}>
          <Button variant="primary">Accedi</Button>
        </Link>
      </YStack>
    );
  }

  if (!user.isProfessional) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
          Questa sezione è per i professionisti
        </Text>
      </YStack>
    );
  }

  const status = sub ? statusText(sub) : null;
  const used = sub?.usage.acceptedJobsThisMonth ?? 0;
  const limit = sub?.usage.monthlyLimit ?? null;
  const ratio = limit ? Math.min(1, used / limit) : 0;
  const barColor = limit && used >= limit ? brand.urgenza : ratio >= 0.8 ? brand.ottone : brand.cianografia;

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={1000} gap="$5">
        <YStack gap="$1">
          <Text fontFamily="$heading" fontWeight="800" fontSize={30} color={brand.grafite}>
            Abbonamento
          </Text>
          <Text color={brand.grafite70}>Tutte le funzioni in ogni livello: cambia solo quanti lavori accettati al mese sono compresi.</Text>
        </YStack>

        {searchParams.get("attivato") ? (
          <Surface borderRadius={radiusDoc} padding="$4" backgroundColor={brand.cianografiaVelo}>
            <Text color={brand.grafite}>Grazie! Il pagamento è andato a buon fine: l&apos;abbonamento si aggiorna qui tra pochi istanti.</Text>
          </Surface>
        ) : null}

        {loadError ? <Text color={brand.urgenza}>{loadError}</Text> : null}

        {sub && status ? (
          <Surface borderRadius={radiusDoc} padding="$5" gap="$4">
            <YStack gap="$1">
              <Text fontFamily="$heading" fontWeight="700" fontSize="$7" color={brand.grafite}>
                {status.title}
              </Text>
              <Text color={brand.grafite70}>{status.detail}</Text>
            </YStack>
            <YStack gap="$2">
              <XStack justifyContent="space-between" flexWrap="wrap" gap="$2">
                <Text fontWeight="700" color={brand.grafite}>
                  Lavori accettati a {sub.usage.monthLabel}
                </Text>
                <Text color={brand.grafite70}>{limit === null ? `${used} · senza limite` : `${used} su ${limit}`}</Text>
              </XStack>
              {limit !== null ? (
                <div className="usage-track" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
                  <div className="usage-fill" style={{ width: `${ratio * 100}%`, background: barColor }} />
                </div>
              ) : null}
              {limit !== null && used >= limit ? (
                <Text color={brand.grafite70} fontSize="$3">
                  Hai raggiunto i lavori compresi questo mese. Puoi passare a un livello superiore qui sotto.
                </Text>
              ) : null}
            </YStack>
          </Surface>
        ) : null}

        <YStack gap="$3">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
            {sub?.tier ? "Cambia livello" : "Scegli il tuo livello"}
          </Text>
          {sub && !sub.checkoutAvailable ? (
            <Text color={brand.grafite70}>I pagamenti online non sono ancora attivi: per ora continui a usare tutto gratuitamente.</Text>
          ) : null}
          {checkoutError ? <Text color={brand.urgenza}>{checkoutError}</Text> : null}
          <YStack gap="$3" $gtSm={{ flexDirection: "row" }}>
            {SUBSCRIPTION_TIERS.map((tier) => {
              const current = sub?.tier === tier.tier && sub.state !== "CANCELED";
              return (
                <Surface
                  key={tier.tier}
                  flex={1}
                  borderRadius={radiusDoc}
                  padding="$4"
                  gap="$2"
                  borderWidth={current ? 2 : 0}
                  borderColor={current ? brand.cianografia : "transparent"}
                >
                  <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
                    {tier.label}
                  </Text>
                  <XStack alignItems="baseline" gap="$1">
                    <Text fontFamily="$heading" fontWeight="700" fontSize="$8" color={brand.grafite}>
                      €{(tier.priceEurCents / 100).toFixed(0)}
                    </Text>
                    <Text color={brand.grafite70}>/mese</Text>
                  </XStack>
                  <Text color={brand.cianografia} fontWeight="700">
                    {tier.monthlyAcceptedJobs === null ? "Lavori senza limite" : `${tier.monthlyAcceptedJobs} lavori al mese`}
                  </Text>
                  <Button
                    variant={current ? "secondary" : "primary"}
                    disabled={current || pendingTier !== null || !sub?.checkoutAvailable}
                    opacity={current || pendingTier !== null || !sub?.checkoutAvailable ? 0.6 : 1}
                    onPress={() => chooseTier(tier.tier)}
                  >
                    {current ? "Il tuo livello" : pendingTier === tier.tier ? "Attendi..." : `Scegli ${tier.label}`}
                  </Button>
                </Surface>
              );
            })}
          </YStack>
          {sub?.state === "TRIAL" ? (
            <Text color={brand.grafite70} fontSize="$3">
              Se scegli ora un livello non perdi i giorni gratuiti: il primo addebito parte alla fine della prova.
            </Text>
          ) : null}
        </YStack>

        <Surface borderRadius={radiusDoc} padding="$5" gap="$2">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
            Compreso in ogni livello
          </Text>
          {SUBSCRIPTION_FEATURES.map((feature) => (
            <Text key={feature} color={brand.grafite70}>
              · {feature}
            </Text>
          ))}
        </Surface>
      </YStack>
      <style jsx>{`
        .usage-track {
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: ${brand.filetto};
          overflow: hidden;
        }
        .usage-fill {
          height: 100%;
          border-radius: 999px;
        }
      `}</style>
    </YStack>
  );
}
