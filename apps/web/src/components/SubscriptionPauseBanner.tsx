"use client";

import Link from "next/link";
import { subscriptionTierInfo, tierPriceDifferenceEurCents, type MySubscription, type SubscriptionTier } from "@professionisti/shared";
import { Button, Surface, Text, YStack, brand, radiusDoc } from "@professionisti/ui";

/**
 * Banner fisso (non si chiude) quando l'account è in pausa per
 * l'abbonamento, in Home e nella pagina Abbonamento (decisione dell'utente,
 * docs/CHANGELOG.md §162): profilo fuori dalla ricerca e niente nuove
 * richieste. Avvisa anche di un pagamento non riuscito, che non mette ancora
 * in pausa.
 */

function formatEur(cents: number): string {
  return `€${(cents / 100).toLocaleString("it-IT", { minimumFractionDigits: cents % 100 ? 2 : 0 })}`;
}

/** Livello successivo per chi ha esaurito i lavori (il mese gratuito vale come Base). */
export function nextTierOf(sub: MySubscription): SubscriptionTier | null {
  const current = sub.tier ?? "BASE";
  if (current === "BASE") return "PLUS";
  if (current === "PLUS") return "PRO";
  return null;
}

/** "1° ottobre": quando ripartono i lavori del mese. */
function nextMonthStartLabel(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `1° ${next.toLocaleDateString("it-IT", { month: "long" })}`;
}

export function upgradeCostText(sub: MySubscription, to: SubscriptionTier): string {
  if (sub.state === "TRIAL") {
    return `Paghi ora solo la differenza (${formatEur(tierPriceDifferenceEurCents("BASE", to))}), poi ${formatEur(subscriptionTierInfo(to).priceEurCents)} al mese dalla fine del mese gratuito.`;
  }
  return "Paghi ora solo la differenza per i giorni che mancano al rinnovo.";
}

export function SubscriptionPauseBanner({ sub, showAction = true }: { sub: MySubscription; showAction?: boolean }) {
  let title: string;
  let body: string;
  let action: string;
  let tone: "stop" | "warn" = "stop";

  if (sub.pausedReason === "LIMIT_REACHED") {
    const limit = sub.usage.monthlyLimit ?? 0;
    const next = nextTierOf(sub);
    title = `Hai raggiunto i ${limit} lavori compresi ${sub.state === "TRIAL" ? "nel mese gratuito" : `nel livello ${sub.tier ? subscriptionTierInfo(sub.tier).label : ""}`}`;
    body =
      `Fino al ${nextMonthStartLabel()} il tuo profilo non compare nelle ricerche e non puoi ricevere nuove richieste. ` +
      "Le richieste e i lavori già in corso restano attivi." +
      (next ? ` Passa a ${subscriptionTierInfo(next).label} per continuare a lavorare subito: ${upgradeCostText(sub, next).replace(/^P/, "p")}` : "");
    action = next ? `Passa a ${subscriptionTierInfo(next).label}` : "Vai all'abbonamento";
  } else if (sub.pausedReason === "TRIAL_ENDED") {
    title = "Il tuo mese gratuito è finito";
    body = "Il tuo account è in pausa: il profilo non compare nelle ricerche e non ricevi nuove richieste. Scegli un livello per renderlo di nuovo visibile e operativo.";
    action = "Riattiva il tuo account";
  } else if (sub.pausedReason === "SUBSCRIPTION_ENDED") {
    title = "Abbonamento concluso";
    body = "Rendi di nuovo visibile e operativo il tuo account: finché non scegli un livello il profilo non compare nelle ricerche e non ricevi nuove richieste.";
    action = "Riattiva il tuo account";
  } else if (sub.state === "PAST_DUE") {
    tone = "warn";
    title = "Pagamento dell'abbonamento non riuscito";
    body = "Riproveremo nei prossimi giorni. Controlla il metodo di pagamento: se il pagamento non va a buon fine l'abbonamento si chiude e il profilo va in pausa.";
    action = "Vai all'abbonamento";
  } else {
    return null;
  }

  const accent = tone === "stop" ? brand.urgenza : brand.ottone;
  return (
    <Surface borderRadius={radiusDoc} padding="$4" gap="$3" borderLeftWidth={4} borderLeftColor={accent} role="status">
      <YStack gap="$1">
        <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
          {title}
        </Text>
        <Text color={brand.grafite70}>{body}</Text>
      </YStack>
      {showAction ? (
        <Link href="/dashboard/abbonamento#livelli" style={{ textDecoration: "none", alignSelf: "flex-start" }}>
          <Button variant="primary">{action}</Button>
        </Link>
      ) : null}
    </Surface>
  );
}
