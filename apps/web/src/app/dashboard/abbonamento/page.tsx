"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import {
  RENEWAL_NOTICE_DAYS,
  SUBSCRIPTION_FEATURES,
  SUBSCRIPTION_TIERS,
  parseBillingInterval,
  parseSubscriptionTier,
  subscriptionTierInfo,
  tierPeriodPriceEurCents,
  withVatEurCents,
  type BillingInterval,
  type MySubscription,
  type SubscriptionTier,
  formatEur as formatEurShared,
} from "@professionisti/shared";
import { Button, ButtonArrow, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { LoadErrorNotice } from "@/components/LoadErrorNotice";
import { ProfileMissingNotice, isProfileMissingError } from "@/components/ProfileMissingNotice";
import { BillingIntervalToggle } from "@/components/BillingIntervalToggle";
import { SubscriptionPauseBanner, upgradeQuoteOf } from "@/components/SubscriptionPauseBanner";
import { SkeletonBlock } from "@/components/Skeleton";

/**
 * "Abbonamento" del professionista (docs/CHANGELOG.md §161-§162): stato del
 * mese gratuito o del livello, lavori accettati nel mese rispetto al limite,
 * banner fisso se l'account è in pausa, scelta o passaggio di livello,
 * rinnovo automatico e annullamento. Il mese regalato compare solo dopo che
 * è stato dato, mai prima (è una sorpresa).
 *
 * Più leggibile a colpo d'occhio (decisione dell'utente, docs/CHANGELOG.md
 * §356): ogni livello con prezzo + IVA, lavori, il riquadro "Se passi ora"
 * con una sola cifra e un pulsante; rinnovo, cambio di livello e
 * annullamento in tre schede da una frase. Mensile o annuale si sceglie solo
 * finché non c'è un abbonamento pagato.
 */

function perLabel(interval: BillingInterval): string {
  return interval === "YEAR" ? "all'anno" : "al mese";
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", timeZone: "Europe/Rome" });
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
}

/**
 * "Lavori dal 18 ottobre al 17 novembre": i lavori ripartono al rinnovo, non
 * il 1° del mese (decisione dell'utente, docs/CHANGELOG.md §357).
 */
function usagePeriodLabel(sub: MySubscription): string {
  // Il rinnovo cade di giorno: l'ultimo giorno intero del periodo è quello prima.
  const lastDay = new Date(new Date(sub.usage.periodEnd).getTime() - 24 * 60 * 60 * 1000).toISOString();
  return `Lavori dal ${dayMonth(sub.usage.periodStart)} al ${dayMonth(lastDay)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Rome" });
}

function formatEur(cents: number): string {
  return formatEurShared(cents);
}

function tierRank(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIERS.findIndex((t) => t.tier === tier);
}

function statusText(sub: MySubscription): { title: string; detail: string } {
  const tierLabel = sub.tier ? subscriptionTierInfo(sub.tier).label : null;
  const trialFuture = sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() > Date.now();
  switch (sub.state) {
    case "TRIAL":
      // Primi 100 professionisti: 3 mesi gratis invece di uno (docs/CHANGELOG.md §358).
      if (sub.founder) {
        return {
          title: `${sub.founder.months} mesi gratis · livello Base`,
          detail: sub.trialEndsAt
            ? `Sei tra i primi 100 professionisti: usi tutte le funzioni del livello Base gratis fino al ${formatDate(sub.trialEndsAt)}. Poi scegli tu se continuare.`
            : `Sei tra i primi 100 professionisti: usi tutte le funzioni del livello Base gratis. I ${sub.founder.months} mesi partono il giorno del lancio del sito.`,
        };
      }
      return {
        title: sub.bonusMonthGranted ? "Mese gratuito in regalo · livello Base" : "Mese gratuito · livello Base",
        detail: sub.trialEndsAt
          ? `${sub.bonusMonthGranted ? "Ti abbiamo regalato un altro mese: usi" : "Usi"} tutte le funzioni del livello Base gratis fino al ${formatDate(sub.trialEndsAt)}. Poi scegli il livello che fa per te.`
          : "Usi tutte le funzioni del livello Base gratis. Il mese gratuito inizia il giorno del lancio del sito: prima non scorre.",
      };
    case "TRIAL_ENDED":
      return { title: sub.founder ? "Mesi gratuiti terminati" : "Mese gratuito terminato", detail: "Scegli il livello che fa per te qui sotto." };
    case "ACTIVE":
      if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd) {
        return { title: `Livello ${tierLabel} · annullato`, detail: `Resta attivo fino al ${formatDate(sub.currentPeriodEnd)}, poi non si rinnova.` };
      }
      return {
        title: `Livello ${tierLabel}`,
        detail:
          trialFuture && sub.trialEndsAt
            ? `Il primo addebito parte alla fine ${sub.founder ? "dei mesi gratuiti" : "del mese gratuito"}, il ${formatDate(sub.trialEndsAt)}, poi si rinnova in automatico ${sub.billingInterval === "YEAR" ? "ogni anno" : "ogni mese"}.`
            : sub.currentPeriodEnd
              ? `Si rinnova in automatico il ${formatDate(sub.currentPeriodEnd)}. Ti avvisiamo qualche giorno prima.`
              : `Si rinnova in automatico ${sub.billingInterval === "YEAR" ? "ogni anno" : "ogni mese"}.`,
      };
    case "PAST_DUE":
      return { title: `Livello ${tierLabel}: pagamento non riuscito`, detail: "Riproveremo nei prossimi giorni: controlla il metodo di pagamento." };
    case "CANCELED":
      return { title: "Abbonamento concluso", detail: "Scegli di nuovo un livello quando vuoi." };
  }
}

/**
 * Tre caselle dei mesi gratuiti dei primi 100 professionisti (decisione
 * dell'utente, docs/CHANGELOG.md §358): usato, in corso, da fare.
 */
function FounderMonths({ founder, trialEndsAt }: { founder: NonNullable<MySubscription["founder"]>; trialEndsAt: string | null }) {
  const current = founder.currentMonth ?? 0;
  const start = trialEndsAt ? new Date(trialEndsAt).getTime() - founder.months * 30 * DAY_MS : null;
  return (
    <YStack gap="$2">
      <Text fontWeight="700" color={brand.grafite}>
        {current > 0 ? `Sei nel ${current}° mese gratis su ${founder.months}` : `I tuoi ${founder.months} mesi gratis partono al lancio`}
      </Text>
      <XStack gap="$2">
        {Array.from({ length: founder.months }, (_, index) => {
          const month = index + 1;
          const state = month < current ? "Usato" : month === current ? "In corso" : "Da fare";
          const active = month === current;
          return (
            <YStack
              key={month}
              flex={1}
              flexBasis={0}
              minWidth={0}
              borderRadius={10}
              padding="$2.5"
              gap={2}
              borderWidth={active ? 2 : 1}
              borderColor={active ? brand.cianografia : brand.filetto}
              backgroundColor={month < current ? brand.cianografiaVelo : active ? brand.calce : brand.gesso}
            >
              <Text fontSize={13} color={brand.grafite70}>
                {month}° mese
              </Text>
              <XStack alignItems="center" gap={4}>
                {month < current ? <Check size={14} strokeWidth={2.5} color={brand.cianografiaScuro} /> : null}
                <Text fontWeight="700" color={month <= current ? brand.cianografiaScuro : brand.grafite70}>
                  {state}
                </Text>
              </XStack>
              {start !== null ? (
                <Text fontSize={13} color={brand.grafite70}>
                  dal {shortDate(new Date(start + index * 30 * DAY_MS).toISOString())}
                </Text>
              ) : null}
            </YStack>
          );
        })}
      </XStack>
    </YStack>
  );
}

export default function AbbonamentoPage() {
  return (
    <Suspense fallback={null}>
      <AbbonamentoContent />
    </Suspense>
  );
}

function AbbonamentoContent() {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const { user, token, isLoading } = useAuth();
  const searchParams = useSearchParams();
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [pendingTier, setPendingTier] = useState<SubscriptionTier | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [renewalPending, setRenewalPending] = useState(false);
  // Livello toccato su /per-professionisti (docs/CHANGELOG.md §177): la
  // sua card viene evidenziata e la pagina scorre fino alla scelta.
  const chosenTier = parseSubscriptionTier(searchParams.get("livello"));
  const justRegistered = searchParams.get("nuovo") === "1";
  // Mensile o annuale scelto su /per-professionisti (`?rinnovo=`); in vista l'annuale.
  const [chosenInterval, setChosenInterval] = useState<BillingInterval>(() => parseBillingInterval(searchParams.get("rinnovo")) ?? "YEAR");
  const [feeDetailsOpen, setFeeDetailsOpen] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    apiClient
      .getMySubscription(token)
      .then(setSub)
      .catch((err) => {
        if (isProfileMissingError(err)) setProfileMissing(true);
        else setLoadError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      });
  }, [token]);

  useEffect(() => {
    if (user?.isProfessional) load();
  }, [user, load]);

  const subLoaded = sub !== null;
  useEffect(() => {
    if (chosenTier && subLoaded) document.getElementById("livelli")?.scrollIntoView({ behavior: "smooth" });
  }, [chosenTier, subLoaded]);

  async function chooseTier(tier: SubscriptionTier) {
    if (!token) return;
    setCheckoutError(null);
    setNotice(null);
    setPendingTier(tier);
    try {
      const { url } = await apiClient.createSubscriptionCheckout(
        token,
        tier,
        sub?.state === "ACTIVE" || sub?.state === "PAST_DUE" ? (sub.billingInterval ?? "MONTH") : chosenInterval,
      );
      if (url) {
        window.location.assign(url);
        return;
      }
      // Passaggio fatto subito, con la quota addebitata sulla carta salvata.
      setNotice(`Fatto: ora sei al livello ${subscriptionTierInfo(tier).label}.`);
      load();
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setPendingTier(null);
    }
  }

  // Carta e fatture nel Customer Portal di Stripe (docs/CHANGELOG.md §238).
  const [portalPending, setPortalPending] = useState(false);
  async function openPortal() {
    if (!token) return;
    setCheckoutError(null);
    setPortalPending(true);
    try {
      const { url } = await apiClient.createBillingPortal(token);
      window.location.href = url;
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setPortalPending(false);
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

  if (profileMissing) {
    return <ProfileMissingNotice text="Serve un profilo completo (nome attività, categoria, città) prima di scegliere l'abbonamento." />;
  }

  const status = sub ? statusText(sub) : null;
  const used = sub?.usage.used ?? 0;
  const limit = sub?.usage.limit ?? null;
  const ratio = limit ? Math.min(1, used / limit) : 0;
  const barColor = limit && used >= limit ? brand.urgenza : ratio >= 0.8 ? brand.ottone : brand.cianografia;
  const paidActive = sub?.state === "ACTIVE" || sub?.state === "PAST_DUE";
  const inTrial = sub?.state === "TRIAL";
  // Con un abbonamento pagato il rinnovo è già deciso; altrimenti lo sceglie l'interruttore.
  const interval: BillingInterval = paidActive ? (sub?.billingInterval ?? "MONTH") : chosenInterval;

  const heading = (
    <YStack gap="$1">
      <Text fontFamily="$heading" fontWeight="800" fontSize={30} color={brand.grafite}>
        Abbonamento
      </Text>
      <Text color={brand.grafite70}>Tutte le funzioni in ogni livello: cambia solo quanti lavori accettati al mese sono compresi.</Text>
    </YStack>
  );

  // Finché non arriva l'abbonamento solo il titolo: prima i livelli
  // comparivano subito e poi scendevano sotto lo stato (CLS, docs/CHANGELOG.md §334).
  if (!sub && !loadError) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={1000} gap="$5">
          {heading}
          <SkeletonBlock height={160} radius={16} />
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={1000} gap="$5">
        {heading}

        {searchParams.get("attivato") ? (
          <Surface borderRadius={radiusDoc} padding="$4" backgroundColor={brand.cianografiaVelo}>
            <Text color={brand.grafite}>Grazie! Il pagamento è andato a buon fine: l&apos;abbonamento si aggiorna qui tra pochi istanti.</Text>
          </Surface>
        ) : null}

        {loadError ? (
          <LoadErrorNotice
            title="Non riusciamo a caricare il tuo abbonamento"
            onRetry={() => {
              setLoadError(null);
              load();
            }}
          />
        ) : null}
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
            {sub.founder && sub.founder.currentMonth !== null ? <FounderMonths founder={sub.founder} trialEndsAt={sub.trialEndsAt} /> : null}
            <YStack gap="$2">
              <XStack justifyContent="space-between" flexWrap="wrap" gap="$2">
                <Text fontWeight="700" color={brand.grafite}>
                  {usagePeriodLabel(sub)}
                </Text>
                <Text color={brand.grafite70}>{limit === null ? `${used} · senza limite` : `${used} su ${limit}`}</Text>
              </XStack>
              {limit !== null ? (
                <div className="usage-track" role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
                  <div className="usage-fill" style={{ width: `${ratio * 100}%`, background: barColor }} />
                </div>
              ) : null}
              {limit !== null && used < limit && used >= Math.ceil(limit * 0.8) ? (
                <Text color={brand.grafite70} fontSize={16}>
                  Ti {limit - used === 1 ? "resta 1 lavoro" : `restano ${limit - used} lavori`}, poi ripartono il {dayMonth(sub.usage.periodEnd)}. Finiti i lavori resti nelle ricerche, ma per mandare preventivi nuovi serve il livello superiore.
                </Text>
              ) : null}
              {sub.usage.countsClientsOnce ? (
                <Text color={brand.grafite70} fontSize={16}>
                  Lo stesso cliente conta una volta sola in questo periodo.
                </Text>
              ) : null}
            </YStack>
          </Surface>
        ) : null}

        <div id="livelli" style={{ scrollMarginTop: 96 }} />
        <YStack gap="$3">
          <XStack alignItems="center" justifyContent="space-between" flexWrap="wrap" gap="$3">
            <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
              {paidActive ? "Livelli" : "Scegli il tuo livello"}
            </Text>
            {paidActive ? null : <BillingIntervalToggle value={chosenInterval} onChange={setChosenInterval} />}
          </XStack>
          {chosenTier ? (
            <Surface borderRadius={radiusDoc} padding="$4" gap="$1" backgroundColor={brand.cianografiaVelo}>
              <Text color={brand.grafite} fontWeight="700">
                Hai scelto il livello {subscriptionTierInfo(chosenTier).label}: confermalo qui sotto.
              </Text>
              {justRegistered ? (
                <Text color={brand.grafite}>
                  Poi{" "}
                  <Link href="/dashboard/profilo" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
                    completa il tuo profilo
                  </Link>{" "}
                  per comparire nelle ricerche.
                </Text>
              ) : null}
            </Surface>
          ) : null}
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
              const periodPrice = tierPeriodPriceEurCents(tier.tier, interval);
              const shownMonthly = interval === "YEAR" ? tier.annualMonthlyEurCents : tier.priceEurCents;
              const quote = sub && !current && !lower ? upgradeQuoteOf(sub, tier.tier) : null;
              let label: string;
              if (current) label = "Il tuo livello";
              else if (pendingTier === tier.tier) label = "Attendi...";
              else if (paidActive || inTrial) label = tier.tier === "BASE" ? "Conferma Base" : `Passa a ${tier.label}`;
              else label = `Scegli ${tier.label}`;
              return (
                <Surface
                  key={tier.tier}
                  // Larghezze uguali solo in riga: in colonna (telefono) flexBasis 0 dava altezza 0 e i riquadri si sovrapponevano.
                  $gtSm={{ flex: 1, flexBasis: 0, minWidth: 0 }}
                  borderRadius={radiusDoc}
                  padding="$4"
                  gap="$3"
                  borderWidth={current || chosenTier === tier.tier ? 2 : 0}
                  borderColor={current ? brand.cianografia : chosenTier === tier.tier ? brand.cianografiaScuro : "transparent"}
                >
                  <XStack alignItems="center" justifyContent="space-between" gap="$2">
                    <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
                      {tier.label}
                    </Text>
                    {current ? (
                      <Text
                        fontSize={13}
                        fontWeight="700"
                        color={brand.cianografiaScuro}
                        backgroundColor={brand.cianografiaVelo}
                        paddingHorizontal="$2"
                        paddingVertical={2}
                        borderRadius="$10"
                      >
                        Il tuo livello
                      </Text>
                    ) : null}
                  </XStack>
                  <YStack gap="$1">
                    <XStack alignItems="baseline" gap="$2" flexWrap="wrap">
                      {freeNow ? (
                        <>
                          <Text fontFamily="$heading" fontSize="$6" color={brand.grafite70} textDecorationLine="line-through">
                            {formatEur(shownMonthly)}
                          </Text>
                          <Text fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.cianografiaScuro}>
                            Gratis
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.grafite}>
                            {formatEur(shownMonthly)}
                          </Text>
                          <Text color={brand.grafite70}>al mese + IVA</Text>
                        </>
                      )}
                    </XStack>
                    <Text color={brand.grafite70} fontSize={15}>
                      {freeNow
                        ? `${sub?.trialEndsAt ? `fino al ${formatDate(sub.trialEndsAt)}, ` : ""}poi ${formatEur(periodPrice)} ${perLabel(interval)} + IVA`
                        : `${interval === "YEAR" ? `${formatEur(periodPrice)} all'anno + IVA · ` : ""}IVA inclusa ${formatEur(withVatEurCents(periodPrice))}`}
                    </Text>
                  </YStack>
                  <XStack alignItems="center" gap="$2">
                    <Check size={18} strokeWidth={2.25} color={brand.cianografiaScuro} />
                    <Text color={brand.cianografiaScuro} fontWeight="700">
                      {tier.monthlyAcceptedJobs === null ? "Lavori senza limite" : `${tier.monthlyAcceptedJobs} lavori al mese`}
                    </Text>
                  </XStack>
                  {tier.tier === "PLUS" ? (
                    // Su Plus e Pro lo stesso cliente conta una volta (§357); su Pro non c'è limite, quindi si dice solo su Plus.
                    <XStack alignItems="center" gap="$2">
                      <Check size={18} strokeWidth={2.25} color={brand.cianografiaScuro} />
                      <Text color={brand.grafite}>Lo stesso cliente conta una volta al mese</Text>
                    </XStack>
                  ) : null}
                  {quote && tier.tier !== "BASE" ? (
                    // Una sola cifra (decisione dell'utente): il calcolo sta in "Cambio di livello" qui sotto.
                    <YStack backgroundColor={brand.gesso} borderRadius={10} padding="$3" gap={2}>
                      <Text fontSize={13} fontWeight="700" letterSpacing={0.6} textTransform="uppercase" color={brand.grafite70}>
                        Se passi ora
                      </Text>
                      <Text color={brand.grafite}>
                        <Text fontWeight="800" color={brand.grafite}>
                          {quote.amountEurCents === 0 ? "Nessun costo" : `${formatEur(quote.amountEurCents)} + IVA`}
                        </Text>
                        {quote.amountEurCents > 0 && quote.until ? ` fino al ${shortDate(quote.until)}` : quote.amountEurCents === 0 ? " fino al lancio" : ""}
                      </Text>
                    </YStack>
                  ) : null}
                  {lower ? (
                    <Text color={brand.grafite70} fontSize={15}>
                      Per scendere di livello annulla e sceglilo alla scadenza.
                    </Text>
                  ) : null}
                  {!current && inTrial && tier.tier === "BASE" ? (
                    <Text color={brand.grafite70} fontSize={15}>
                      Nessun addebito fino alla fine {sub?.founder ? "dei mesi gratuiti" : "del mese gratuito"}.
                    </Text>
                  ) : null}
                  <YStack flex={1} />
                  {lower ? null : !current && sub && !sub.checkoutAvailable ? (
                    // Senza Stripe nessun livello si può scegliere: una riga chiara
                    // al posto di un pulsante spento che sembra attivo (§349).
                    <Text color={brand.grafite70} fontSize={16} paddingVertical="$2">
                      Disponibile dal lancio
                    </Text>
                  ) : (
                    <Button
                      variant={current || disabled ? "secondary" : "acquisto"}
                      disabled={disabled}
                      opacity={disabled && !current ? 0.55 : 1}
                      onPress={() => chooseTier(tier.tier)}
                    >
                      {current || disabled ? (
                        label
                      ) : (
                        <XStack alignItems="center" gap="$2">
                          <Text color="white" fontFamily="$body" fontWeight="600">
                            {label}
                          </Text>
                          <ButtonArrow tone="red" />
                        </XStack>
                      )}
                    </Button>
                  )}
                </Surface>
              );
            })}
          </YStack>
          <YStack gap="$3" $gtSm={{ flexDirection: "row" }}>
            <Surface $gtSm={{ flex: 1, flexBasis: 0, minWidth: 0 }} borderRadius={radiusDoc} padding="$4" gap="$1">
              <Text fontWeight="700" color={brand.grafite}>
                Rinnovo
              </Text>
              <Text color={brand.grafite70} fontSize={15} lineHeight={22}>
                {interval === "YEAR" ? "Ogni anno" : "Ogni mese"} in automatico. Ti avvisiamo {RENEWAL_NOTICE_DAYS} giorni prima.
              </Text>
            </Surface>
            <Surface $gtSm={{ flex: 1, flexBasis: 0, minWidth: 0 }} borderRadius={radiusDoc} padding="$4" gap="$1">
              <Text fontWeight="700" color={brand.grafite}>
                Cambio di livello
              </Text>
              <Text color={brand.grafite70} fontSize={15} lineHeight={22}>
                10 € più i giorni che restano, con il 10% in più.{" "}
                <button type="button" className="fee-more" aria-expanded={feeDetailsOpen} onClick={() => setFeeDetailsOpen((open) => !open)}>
                  {feeDetailsOpen ? "Chiudi" : "Scopri di più"}
                </button>
              </Text>
              {feeDetailsOpen ? (
                <Text color={brand.grafite70} fontSize={15} lineHeight={22} marginTop="$1">
                  Paghi 10 € più la differenza di prezzo tra i due livelli per i giorni che mancano al rinnovo, maggiorata del 10% (+ IVA). Esempio: da
                  Base a Plus con 7 giorni rimasti su 30 paghi 20,27 € + IVA. Il nuovo livello vale da subito; al rinnovo paghi il nuovo livello intero.
                </Text>
              ) : null}
            </Surface>
            <Surface $gtSm={{ flex: 1, flexBasis: 0, minWidth: 0 }} borderRadius={radiusDoc} padding="$4" gap="$1">
              <Text fontWeight="700" color={brand.grafite}>
                Annulli quando vuoi
              </Text>
              <Text color={brand.grafite70} fontSize={15} lineHeight={22}>
                Resta attivo fino alla fine {interval === "YEAR" ? "dell'anno" : "del mese"} già pagato.
              </Text>
            </Surface>
          </YStack>
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
                    ? `Prossimo rinnovo il ${formatDate(sub.currentPeriodEnd)}: ${formatEur(tierPeriodPriceEurCents(sub.tier, interval))} + IVA.`
                    : interval === "YEAR"
                      ? "Si rinnova ogni anno."
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

        {sub?.checkoutAvailable ? (
          <Surface borderRadius={radiusDoc} padding="$5" gap="$3">
            <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
              Carta e fatture
            </Text>
            <Text color={brand.grafite70}>Cambia la carta di pagamento e scarica le fatture di abbonamento e visibilità, su una pagina sicura di Stripe.</Text>
            <Button variant="secondary" alignSelf="flex-start" disabled={portalPending} opacity={portalPending ? 0.6 : 1} onPress={openPortal}>
              {portalPending ? "Apertura..." : "Gestisci carta e fatture"}
            </Button>
          </Surface>
        ) : null}

        <Surface borderRadius={radiusDoc} padding="$5" gap="$2">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
            Compreso in ogni livello
          </Text>
          {SUBSCRIPTION_FEATURES.map((feature) => (
            <XStack key={feature} gap="$2" alignItems="flex-start">
              <Check size={16} strokeWidth={2} color={brand.cianografiaScuro} style={{ marginTop: 4, flexShrink: 0 }} />
              <Text color={brand.grafite70} flex={1}>
                {feature}
              </Text>
            </XStack>
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
        .fee-more {
          all: unset;
          cursor: pointer;
          color: ${brand.cianografiaScuro};
          font-weight: 700;
          text-decoration: underline;
        }
        .fee-more:focus-visible {
          outline: 2px solid ${brand.cianografiaScuro};
          outline-offset: 2px;
        }
        .usage-fill {
          height: 100%;
          border-radius: 999px;
        }
      `}</style>
    </YStack>
  );
}
