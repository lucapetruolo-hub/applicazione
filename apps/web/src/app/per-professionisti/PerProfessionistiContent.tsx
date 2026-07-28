"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import type { SUBSCRIPTION_PLANS } from "@professionisti/shared";
import { Button, H1, H2, Paragraph, Text, XStack, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

const FEATURE_LABELS: Record<string, string> = {
  "profilo-base": "Profilo pubblico su Professionisti",
  "ricezione-richieste": "Ricezione richieste di preventivo",
  "agenda-digitale": "Agenda digitale",
  "promemoria-automatici": "Promemoria automatici anti no-show",
  "badge-verificato": "Badge \"verificato\"",
  fatturazione: "Fatturazione integrata",
  "multi-operatore": "Multi-operatore",
  "statistiche-comparative": "Statistiche comparative di categoria",
};

export function PerProfessionistiContent({ plans }: { plans: typeof SUBSCRIPTION_PLANS }) {
  const router = useRouter();
  const { user, token, isLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  async function handlePlanSelect(planSlug: string, priceEurCents: number) {
    setError(null);
    if (isLoading) {
      return;
    }
    if (priceEurCents === 0 || !user || !token) {
      router.push("/registrati?ruolo=professionista");
      return;
    }
    if (user.role !== "PROFESSIONAL") {
      setError("Il tuo account è registrato come cliente: iscriviti come professionista con un'altra email.");
      return;
    }

    setLoadingPlan(planSlug);
    try {
      const { url } = await apiClient.createSubscriptionCheckout(token, planSlug.toUpperCase() as "PRO" | "BUSINESS");
      if (url) {
        window.location.href = url;
      } else {
        setError("Checkout non disponibile al momento.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <YStack width="100%" alignItems="center">
      <YStack width="100%" backgroundColor="$blue2" paddingVertical="$9" paddingHorizontal="$4" alignItems="center" gap="$4">
        <YStack maxWidth={680} gap="$3" alignItems="center">
          <H1 size="$9" textAlign="center">
            Fatti trovare dai clienti della tua zona
          </H1>
          <Paragraph fontSize="$5" color="$color10" textAlign="center">
            Ricevi richieste di preventivo qualificate, gestisci l&apos;agenda e costruisci la tua reputazione online.
            Il piano Free è gratis per sempre.
          </Paragraph>
        </YStack>
        <Link href="/registrati?ruolo=professionista" style={{ textDecoration: "none" }}>
          <Button size="$6">Iscriviti gratis</Button>
        </Link>
      </YStack>

      <YStack width="100%" maxWidth={1080} paddingVertical="$8" paddingHorizontal="$4" gap="$5">
        <H2 size="$8" textAlign="center">
          Scegli il piano giusto per te
        </H2>

        {error ? (
          <Text color="$red10" textAlign="center">
            {error}
          </Text>
        ) : null}

        <YStack width="100%" gap="$4" $gtSm={{ flexDirection: "row" }}>
          {plans.map((plan, index) => (
            <YStack
              key={plan.slug}
              flex={1}
              borderWidth={2}
              borderColor={index === 1 ? "$blue10" : "$borderColor"}
              borderRadius="$6"
              padding="$5"
              gap="$4"
              backgroundColor="white"
            >
              <YStack gap="$1">
                <Text fontWeight="700" fontSize="$7">
                  {plan.label}
                </Text>
                <XStack alignItems="baseline" gap="$1">
                  <Text fontWeight="800" fontSize="$9">
                    {plan.priceEurCents === 0 ? "€0" : `€${(plan.priceEurCents / 100).toFixed(0)}`}
                  </Text>
                  <Text color="$color9">/mese</Text>
                </XStack>
              </YStack>

              <YStack gap="$2">
                {plan.features.map((feature) => (
                  <XStack key={feature} gap="$2" alignItems="flex-start">
                    <Check size={16} strokeWidth={2} color="#1B4D8F" />
                    <Text color="$color11" flex={1}>
                      {FEATURE_LABELS[feature] ?? feature}
                    </Text>
                  </XStack>
                ))}
              </YStack>

              <Button
                size="$5"
                backgroundColor={index === 1 ? "$blue10" : "$color4"}
                color={index === 1 ? "white" : "$color12"}
                onPress={() => handlePlanSelect(plan.slug, plan.priceEurCents)}
                disabled={loadingPlan === plan.slug || isLoading}
                opacity={loadingPlan === plan.slug || isLoading ? 0.6 : 1}
              >
                {loadingPlan === plan.slug ? "Attendi..." : plan.priceEurCents === 0 ? "Inizia gratis" : "Iscriviti"}
              </Button>
            </YStack>
          ))}
        </YStack>
      </YStack>
    </YStack>
  );
}
