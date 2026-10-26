"use client";

import Link from "next/link";
import { formatEur as formatEurShared, subscriptionTierInfo, tierPeriodPriceEurCents, type MySubscription, type SubscriptionTier } from "@professionisti/shared";
import { Button, Surface, Text, YStack, brand, radiusDoc } from "@professionisti/ui";

/**
 * Banner fisso (non si chiude) quando l'account è in pausa per
 * l'abbonamento, in Home e nella pagina Abbonamento (decisione dell'utente,
 * docs/CHANGELOG.md §162): profilo fuori dalla ricerca e niente nuove
 * richieste. Avvisa anche dei lavori esauriti (§362) e di un pagamento non
 * riuscito, che non mettono in pausa.
 */

function formatEur(cents: number): string {
  return formatEurShared(cents);
}

/** Livello successivo per chi ha esaurito i lavori (il mese gratuito vale come Base). */
export function nextTierOf(sub: MySubscription): SubscriptionTier | null {
  const current = sub.tier ?? "BASE";
  if (current === "BASE") return "PLUS";
  if (current === "PLUS") return "PRO";
  return null;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", timeZone: "Europe/Rome" });
}

/** Quota di passaggio adesso verso un livello (docs/CHANGELOG.md §361), o null se non si può passare. */
export function upgradeQuoteOf(sub: MySubscription, to: SubscriptionTier) {
  return sub.upgradeQuotes.find((quote) => quote.tier === to) ?? null;
}

/** "20,27 € + IVA fino al 31 ottobre, poi 59 € al mese + IVA." */
export function upgradeCostText(sub: MySubscription, to: SubscriptionTier): string {
  const quote = upgradeQuoteOf(sub, to);
  const interval = sub.billingInterval ?? "MONTH";
  const then = `${formatEur(tierPeriodPriceEurCents(to, interval))} ${interval === "YEAR" ? "all'anno" : "al mese"} + IVA`;
  if (!quote || quote.amountEurCents === 0) return `Nessun costo adesso, poi ${then}.`;
  return `Paghi ora ${formatEur(quote.amountEurCents)} + IVA${quote.until ? ` fino al ${shortDate(quote.until)}` : ""}, poi ${then}.`;
}

/**
 * `profileStepsElsewhere`: dati fiscali e verifica dell'identità li mostra già
 * "Completa il profilo" (Oggi, docs/CHANGELOG.md §260), qui restano solo
 * pausa e pagamento.
 */
export function SubscriptionPauseBanner({ sub, showAction = true, profileStepsElsewhere = false }: { sub: MySubscription; showAction?: boolean; profileStepsElsewhere?: boolean }) {
  let title: string;
  let body: string;
  let action: string;
  let tone: "stop" | "warn" = "stop";
  let href = "/dashboard/abbonamento#livelli";

  // Prima di tutto i dati fiscali: senza, il profilo non è pubblico (docs/CHANGELOG.md §241).
  if (sub.fiscalDataNeeded && !profileStepsElsewhere) {
    title = "Il tuo profilo non è ancora visibile";
    body =
      "Per comparire nelle ricerche e ricevere richieste scegli se sei privato, professionista con partita IVA o azienda e compila (o correggi) i dati fiscali: " +
      "la legge ci chiede di raccoglierli per tutti. Li controlliamo in automatico.";
    action = "Compila i dati fiscali";
    href = "/dashboard/fiscale";
  } else if (sub.pausedReason === "TRIAL_ENDED") {
    title = sub.founder ? "I tuoi mesi gratuiti sono finiti" : "Il tuo mese gratuito è finito";
    body = "Il tuo account è in pausa: il profilo non compare nelle ricerche e non ricevi nuove richieste. Scegli un livello per renderlo di nuovo visibile e operativo.";
    action = "Riattiva il tuo account";
  } else if (sub.pausedReason === "SUBSCRIPTION_ENDED") {
    title = "Abbonamento concluso";
    body = "Rendi di nuovo visibile e operativo il tuo account: finché non scegli un livello il profilo non compare nelle ricerche e non ricevi nuove richieste.";
    action = "Riattiva il tuo account";
  } else if (sub.limitReached) {
    // Lavori esauriti: il profilo resta nella ricerca, si fermano solo i preventivi nuovi (docs/CHANGELOG.md §362).
    const next = nextTierOf(sub);
    tone = "warn";
    title = `Hai esaurito l'abbonamento ${subscriptionTierInfo(sub.tier ?? "BASE").label}`;
    body =
      `Il tuo profilo resta visibile e ricevi le richieste, ma fino al ${shortDate(sub.usage.periodEnd)} non puoi mandare preventivi nuovi. ` +
      (next ? `Passa a ${subscriptionTierInfo(next).label} per rispondere subito: ${upgradeCostText(sub, next).replace(/^P/, "p")}` : "");
    action = next ? `Passa a ${subscriptionTierInfo(next).label}` : "Vai all'abbonamento";
  } else if (sub.identityVerificationNeeded && showAction && !profileStepsElsewhere) {
    // Documento e selfie prima del primo preventivo (docs/CHANGELOG.md §253).
    tone = "warn";
    title = "Verifica la tua identità per inviare preventivi";
    body = "Il tuo profilo è visibile, ma per rispondere ai clienti con un preventivo serve una verifica veloce: un documento e un selfie, circa 2 minuti.";
    action = "Verifica la tua identità";
    href = "/dashboard/verifica-identita";
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
        <Link href={href} style={{ textDecoration: "none", alignSelf: "flex-start" }}>
          <Button variant="primary">{action}</Button>
        </Link>
      ) : null}
    </Surface>
  );
}
