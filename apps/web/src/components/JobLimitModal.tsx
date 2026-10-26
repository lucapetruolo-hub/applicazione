"use client";

import { useEffect, useRef, useState } from "react";
import { formatEur, subscriptionTierInfo, tierPeriodPriceEurCents, type MySubscription } from "@professionisti/shared";
import { Button, ButtonArrow, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";
import { nextTierOf, upgradeQuoteOf } from "@/components/SubscriptionPauseBanner";

function dayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
}

/**
 * Finestra al limite dei lavori (decisione dell'utente, docs/CHANGELOG.md
 * §355): si apre quando il professionista prova a mandare un preventivo a
 * una richiesta nuova con i lavori del periodo esauriti. Mostra la richiesta,
 * il livello sopra con una sola cifra (la quota di passaggio, §354) e la
 * data in cui i lavori ripartono. Con un abbonamento pagato il passaggio è
 * immediato e si torna al preventivo; altrimenti si paga su Stripe.
 */
export function JobLimitModal({
  sub,
  request,
  onClose,
  onUpgraded,
}: {
  sub: MySubscription;
  /** Es. "Idraulico · Latina": la richiesta a cui stava rispondendo. */
  request: string;
  onClose: () => void;
  /** Passaggio fatto senza lasciare il sito: il genitore ricarica l'abbonamento e riapre il preventivo. */
  onUpgraded: () => void;
}) {
  const { token } = useAuth();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const currentLabel = subscriptionTierInfo(sub.tier ?? "BASE").label;
  const next = nextTierOf(sub);
  const nextInfo = next ? subscriptionTierInfo(next) : null;
  const quote = next ? upgradeQuoteOf(sub, next) : null;
  const interval = sub.billingInterval ?? "MONTH";
  const restart = dayMonth(sub.usage.periodEnd);

  async function upgrade() {
    if (!token || !next) return;
    setError(null);
    setPending(true);
    try {
      const { url } = await apiClient.createSubscriptionCheckout(token, next, interval);
      if (url) {
        window.location.assign(url);
        return;
      }
      onUpgraded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setPending(false);
    }
  }

  return (
    <div
      role="presentation"
      onClick={closeOnBackdrop(onClose)}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(43,32,19,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 400,
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="job-limit-title" style={{ width: "100%", maxWidth: 460, maxHeight: "100%", overflowY: "auto" }}>
        <YStack width="100%" backgroundColor={brand.calce} borderRadius="$5" padding="$5" gap="$4">
          <YStack gap="$2">
            <Text id="job-limit-title" tag="h2" fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite}>
              Hai esaurito l&apos;abbonamento {currentLabel}
            </Text>
            {nextInfo ? (
              <Text color={brand.grafite70} lineHeight={22}>
                Passa a {nextInfo.label} per rispondere subito: vale da oggi fino al rinnovo.
              </Text>
            ) : null}
          </YStack>

          <YStack backgroundColor={brand.gesso} borderRadius={10} padding="$3" gap={2}>
            <Text fontSize={13} color={brand.grafite70}>
              Stai rispondendo a
            </Text>
            <Text fontWeight="700" color={brand.grafite}>
              {request}
            </Text>
          </YStack>

          {nextInfo && next ? (
            <YStack borderWidth={2} borderColor={brand.cianografia} borderRadius={10} padding="$4" gap="$1">
              <Text fontWeight="700" color={brand.grafite}>
                {nextInfo.label} · {nextInfo.monthlyAcceptedJobs === null ? "lavori senza limite" : `${nextInfo.monthlyAcceptedJobs} lavori al mese`}
              </Text>
              <XStack alignItems="baseline" gap="$2" flexWrap="wrap" marginTop="$1">
                <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
                  {quote && quote.amountEurCents > 0 ? formatEur(quote.amountEurCents) : "Nessun costo"}
                </Text>
                <Text color={brand.grafite70}>
                  {quote && quote.amountEurCents > 0 ? "+ IVA" : "adesso"}
                  {quote?.until ? ` fino al ${dayMonth(quote.until)}` : ""}
                </Text>
              </XStack>
              <Text fontSize={13} color={brand.grafite70}>
                Poi {formatEur(tierPeriodPriceEurCents(next, interval))} {interval === "YEAR" ? "all'anno" : "al mese"} + IVA.
              </Text>
            </YStack>
          ) : null}

          {error ? <Text color={brand.urgenza}>{error}</Text> : null}
          {!sub.checkoutAvailable ? <Text color={brand.grafite70}>I pagamenti online non sono ancora attivi su questo ambiente.</Text> : null}

          <YStack gap="$2">
            {nextInfo && sub.checkoutAvailable ? (
              <Button variant="acquisto" disabled={pending} opacity={pending ? 0.6 : 1} onPress={upgrade}>
                <XStack alignItems="center" gap="$2">
                  <Text color="white" fontFamily="$body" fontWeight="600">
                    {pending ? "Attendi..." : `Passa a ${nextInfo.label} e rispondi`}
                  </Text>
                  {pending ? null : <ButtonArrow tone="red" />}
                </XStack>
              </Button>
            ) : null}
            <Button variant="secondary" onPress={onClose}>
              {`Aspetto il ${restart}`}
            </Button>
          </YStack>
          <Text fontSize={13} color={brand.grafite70} textAlign="center">
            I lavori già presi e i preventivi già mandati restano validi.
          </Text>
        </YStack>
      </div>
    </div>
  );
}
