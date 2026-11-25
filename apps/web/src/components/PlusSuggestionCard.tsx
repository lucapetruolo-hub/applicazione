"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { shouldSuggestPlus, subscriptionTierInfo, type MySubscription } from "@professionisti/shared";
import { Button, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { upgradeCostText } from "@/components/SubscriptionPauseBanner";

/**
 * Plus proposto nei mesi gratis (decisione di Luca del 25/11/2026,
 * docs/changelog/2026-11-25-conti-del-mese.md): a chi riceve più richieste di
 * quanti lavori Base gli lascia accettare, prima che li finisca. Tono di buona
 * notizia (gli arriva lavoro), mai d'allarme. "Non ora" la nasconde fino al
 * periodo successivo su questo dispositivo.
 */
const storageKey = (periodStart: string) => `plus-nei-mesi-gratis:${periodStart}`;

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
}

// "Non ora" salvato nel browser; chi lo legge si aggiorna subito dopo il clic.
const listeners = new Set<() => void>();
// Anche in memoria, se il browser non lascia salvare: nascosta almeno per questa visita.
const dismissed = new Set<string>();
function readHidden(key: string): boolean {
  if (dismissed.has(key)) return true;
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export function PlusSuggestionCard({ sub, showAction = true }: { sub: MySubscription; showAction?: boolean }) {
  const key = storageKey(sub.usage.periodStart);
  // Sul server non si conosce la memoria del browser: nascosta fino al montaggio.
  const hidden = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => readHidden(key),
    () => true,
  );

  // Nella pagina Abbonamento (senza pulsanti) resta sempre, anche dopo "Non ora".
  if (!shouldSuggestPlus(sub) || (showAction && hidden) || sub.usage.limit === null) return null;

  const plus = subscriptionTierInfo("PLUS");
  const close = () => {
    dismissed.add(key);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Memoria bloccata: vale solo per questa visita.
    }
    listeners.forEach((listener) => listener());
  };

  return (
    <Surface borderRadius={radiusDoc} padding="4" gap="3" borderLeftWidth={4} borderLeftColor={brand.cianografiaScuro} role="status">
      <YStack gap="1">
        <Text fontFamily="heading" fontWeight="800" fontSize="6" color={brand.grafite}>
          Ti arrivano tante richieste
        </Text>
        <Text color={brand.grafite70}>
          {`Dal ${shortDate(sub.usage.periodStart)} ne hai ricevute ${sub.usage.requests}, ma nei mesi gratis puoi accettare ${sub.usage.limit} lavori fino al ${shortDate(sub.usage.periodEnd)}. `}
          {`Con ${plus.label} ne accetti ${plus.monthlyAcceptedJobs} al mese. ${upgradeCostText(sub, "PLUS")}`}
        </Text>
      </YStack>
      {showAction ? (
        <XStack gap="2" flexWrap="wrap" justifyContent="flex-end">
          <Button variant="ghost" size="3" onPress={close}>
            Non ora
          </Button>
          <Link href="/dashboard/abbonamento#livelli" style={{ textDecoration: "none" }}>
            <Button tabIndex={-1} variant="primary" size="3">
              {`Passa a ${plus.label}`}
            </Button>
          </Link>
        </XStack>
      ) : null}
    </Surface>
  );
}
