"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  SUBSCRIPTION_FEATURES,
  SUBSCRIPTION_TIERS,
  subscriptionTierInfo,
  type MySubscription,
  type SubscriptionTier,
} from "@professionisti/shared";
import { Button, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { SubscriptionPauseBanner, upgradeCostText } from "@/components/SubscriptionPauseBanner";

/**
 * "Abbonamento" del professionista (docs/CHANGELOG.md §161-§162): stato del
 * mese gratuito o del livello, lavori accettati nel mese rispetto al limite,
 * banner fisso se l'account è in pausa, scelta o passaggio di livello
 * pagando solo la differenza, rinnovo automatico e annullamento. Il mese
 * regalato compare solo dopo che è stato dato, mai prima (è una sorpresa).
 */

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

function formatEur(cents: number): string {
  return `€${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
}

function tierRank(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS.findIndex((t) => t.tier === tier);
}

function statusText(sub: MySubscription): { title: string; detail: string } {
  const tierLabel = sub.tier ? subscriptionTierInfo(sub.tier).label : null;
  const trialFuture = sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() > Date.now();
  switch (sub.state) {
    case "TRIAL":
      return {
        title: sub.bonusMonthGranted ? "Mese gratuito in regalo · livello Base" : "Mese gratuito · livello Base",
        detail: sub.trialEndsAt
          ? `${sub.bonusMonthGranted ? "Ti abbiamo regalato un altro mese: usi" : "Usi"} tutte le funzioni del livello Base gratis fino al ${formatDate(sub.trialEndsAt)}. Poi scegli il livello che fa per te.`
          : "Usi tutte le funzioni del livello Base gratis.",
      };
    case "TRIAL_ENDED":
      return { title: "Mese gratuito terminato", detail: "Scegli il livello che fa per te qui sotto." };
    case "ACTIVE":
      if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
        return { title: `Livello ${tierLabel} · annullato`, detail: `Resta attivo fino al ${formatDate(sub.currentPeriodEnd)}, poi non si rinnova.` };
      }
      return {
        title: `Livello ${tierLabel}`,
        detail:
          trialFuture && sub.trialEndsAt
            ? `Il primo addebito parte alla fine del mese gratuito, il ${formatDate(sub.trialEndsAt)}, poi si rinnova in automatico ogni mese.`
            : sub.currentPeriodEnd
              ? `Si rinnova in automatico il ${formatDate(sub.currentPeriodEnd)}. Ti avvisiamo qualche giorno prima.`
              : "Si rinnova in automatico ogni mese.",
      };
    case "PAST_DUE":
      return { title: `Livello ${tierLabel}: pagamento non riuscito`, detail: "Riproveremo nei prossimi giorni: controlla il metodo di pagamento." };
    case "CANCELED":
      return { title: "Abbonamento concluso", detail: "Scegli di nuovo un livello quando vuoi." };
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

  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [renewalPending, setRenewalPending] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .getMySubscription(token)
      .then(setSub)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Errore imprevisto, riprova."));
  }, [token]);

  useEffect(() => {
    if (user?.isProfessional) load();
  }, [user, load]);

  async function chooseTier(tier: SubscriptionTier) {
    if (!token) return;
    setCheckoutError(null);
    setNotice(null);
    setPendingTier(tier);
    try {
      const { url } = await apiClient.createSubscriptionCheckout(token, tier);
      if (url) {
        window.location.href = url;
        return;
      }
      // Passaggio fatto subito, con la differenza addebitata sulla carta salvata.
      setNotice(`Fatto: ora sei al livello ${subscriptionTierInfo(tier).label}.`);
      load();
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setPendingTier(null);
    }
  }

  async function setRenewal(renew: boolean) {
    if (!token) return;
    setCheckoutError(null);
    setRenewalPending(true);
    try {
      await apiClient.setSubscriptionRenewal(token, renew);
      setConfirmCancel(false);
      setNotice(renew ? "Rinnovo automatico riattivato." : "Abbonamento annullato: resta attivo fino alla scadenza.");
      load();
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setRenewalPending(false);
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
  const paidActive = sub?.state === "ACTIVE" || sub?.state === "PAST_DUE";
  const inTrial = sub?.state === "TRIAL";

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
        {notice ? (
          <Surface borderRadius={radiusDoc} padding="$4" backgroundColor={brand.cianografiaVelo}>
            <Text color={brand.grafite}>{notice}</Text>
          </Surface>
        ) : null}

        {sub ? <SubscriptionPauseBanner sub={sub} showAction={false} /> : null}

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
              {limit !== null && used < limit && used >= Math.ceil(limit * 0.8) ? (
                <Text color={brand.grafite70} fontSize="$3">
                  Ti restano {limit - used} {limit - used === 1 ? "lavoro" : "lavori"} questo mese. Raggiunto il limite il profilo esce dalle ricerche fino al mese prossimo.
                </Text>
              ) : null}
            </YStack>
          </Surface>
        ) : null}

        <div id="livelli" style={{ scrollMarginTop: 96 }} />
        <YStack gap="$3">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
            {paidActive ? "Passa a un livello superiore" : "Scegli il tuo livello"}
          </Text>
          {sub && !sub.checkoutAvailable ? (
            <Text color={brand.grafite70}>I pagamenti online non sono ancora attivi su questo ambiente.</Text>
          ) : null}
          {checkoutError ? <Text color={brand.urgenza}>{checkoutError}</Text> : null}
          <YStack gap="$3" $gtSm={{ flexDirection: "row" }}>
            {SUBSCRIPTION_TIERS.map((tier) => {
              const current = (paidActive && sub?.tier === tier.tier) || (inTrial && !sub?.tier && tier.tier === "BASE");
              const lower = paidActive && sub?.tier ? tierRank(tier.tier) < tierRank(sub.tier) : false;
              // Durante il mese gratuito Base è gratis: il prezzo barrato mostra quanto vale.
              const freeNow = inTrial && tier.tier === "BASE";
              const disabled = current || lower || pendingTier !== null || !sub?.checkoutAvailable;
              let hint: string | null = null;
              if (lower) hint = "Per scendere di livello annulla e sceglilo alla scadenza.";
              else if (!current && sub && (paidActive || inTrial) && tier.tier !== "BASE") hint = upgradeCostText(sub, tier.tier);
              else if (!current && inTrial && tier.tier === "BASE") hint = "Nessun addebito fino alla fine del mese gratuito.";
              let label: string;
              if (current) label = "Il tuo livello";
              else if (pendingTier === tier.tier) label = "Attendi...";
              else if (paidActive || inTrial) label = tier.tier === "BASE" ? "Conferma Base" : `Passa a ${tier.label}`;
              else label = `Scegli ${tier.label}`;
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
                  <XStack alignItems="baseline" gap="$2" flexWrap="wrap">
                    {freeNow ? (
                      <>
                        <Text fontFamily="$heading" fontSize="$6" color={brand.grafite70} textDecorationLine="line-through">
                          {formatEur(tier.priceEurCents)}
                        </Text>
                        <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.cianografia}>
                          Gratuito
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text fontFamily="$heading" fontWeight="700" fontSize="$8" color={brand.grafite}>
                          {formatEur(tier.priceEurCents)}
                        </Text>
                        <Text color={brand.grafite70}>/mese</Text>
                      </>
                    )}
                  </XStack>
                  {freeNow && sub?.trialEndsAt ? (
                    <Text color={brand.grafite70} fontSize="$3">
                      fino al {formatDate(sub.trialEndsAt)}, poi {formatEur(tier.priceEurCents)}/mese
                    </Text>
                  ) : null}
                  <Text color={brand.cianografia} fontWeight="700">
                    {tier.monthlyAcceptedJobs === null ? "Lavori senza limite" : `${tier.monthlyAcceptedJobs} lavori al mese`}
                  </Text>
                  {hint ? (
                    <Text color={brand.grafite70} fontSize="$3">
                      {hint}
                    </Text>
                  ) : null}
                  <Button
                    variant={current ? "secondary" : "primary"}
                    disabled={disabled}
                    opacity={disabled ? 0.6 : 1}
                    onPress={() => chooseTier(tier.tier)}
                  >
                    {label}
                  </Button>
                </Surface>
              );
            })}
          </YStack>
          <Text color={brand.grafite70} fontSize="$3">
            L&apos;abbonamento si rinnova in automatico ogni mese: ti avvisiamo qualche giorno prima di ogni rinnovo e puoi annullarlo quando vuoi.
          </Text>
        </YStack>

        {paidActive && sub ? (
          <Surface borderRadius={radiusDoc} padding="$5" gap="$3">
            <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
              Rinnovo automatico
            </Text>
            {sub.cancelAtPeriodEnd ? (
              <>
                <Text color={brand.grafite70}>
                  Hai annullato l&apos;abbonamento: resta attivo
                  {sub.currentPeriodEnd ? ` fino al ${formatDate(sub.currentPeriodEnd)}` : " fino alla scadenza"}, poi il profilo va in pausa.
                </Text>
                <Button variant="primary" alignSelf="flex-start" disabled={renewalPending} opacity={renewalPending ? 0.6 : 1} onPress={() => setRenewal(true)}>
                  {renewalPending ? "Attendi..." : "Riattiva il rinnovo"}
                </Button>
              </>
            ) : confirmCancel ? (
              <>
                <Text color={brand.grafite}>
                  Vuoi davvero annullare? L&apos;abbonamento resta attivo
                  {sub.currentPeriodEnd ? ` fino al ${formatDate(sub.currentPeriodEnd)}` : " fino alla scadenza"}, poi non si rinnova e il tuo profilo esce dalle ricerche.
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  <Button variant="urgent" disabled={renewalPending} opacity={renewalPending ? 0.6 : 1} onPress={() => setRenewal(false)}>
                    {renewalPending ? "Attendi..." : "Sì, annulla l'abbonamento"}
                  </Button>
                  <Button variant="secondary" onPress={() => setConfirmCancel(false)}>
                    No, tienilo
                  </Button>
                </XStack>
              </>
            ) : (
              <>
                <Text color={brand.grafite70}>
                  {sub.currentPeriodEnd && sub.tier
                    ? `Prossimo rinnovo il ${formatDate(sub.currentPeriodEnd)}: ${formatEur(subscriptionTierInfo(sub.tier).priceEurCents)}.`
                    : "Si rinnova ogni mese."}{" "}
                  Se annulli, resta attivo fino alla scadenza.
                </Text>
                <Button variant="secondary" alignSelf="flex-start" onPress={() => setConfirmCancel(true)}>
                  Annulla abbonamento
                </Button>
              </>
            )}
          </Surface>
        ) : null}

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
