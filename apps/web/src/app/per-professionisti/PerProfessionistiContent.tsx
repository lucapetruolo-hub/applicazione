"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import type { SUBSCRIPTION_PLANS } from "@professionisti/shared";
import { Button, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
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
    if (!user.isProfessional) {
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
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso}>
      <YStack width="100%" backgroundColor={brand.cianografiaVelo} paddingVertical="$9" paddingHorizontal="$4" alignItems="center" gap="$4">
        <YStack maxWidth={680} gap="$3" alignItems="center">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$9" textAlign="center" color={brand.grafite}>
            Fatti trovare dai clienti della tua zona
          </Text>
          <Text fontSize="$5" color={brand.grafite70} textAlign="center">
            Ricevi richieste di preventivo qualificate, gestisci l&apos;agenda e costruisci la tua reputazione online.
            Il piano Free è gratis per sempre.
          </Text>
        </YStack>
        <Link href="/registrati?ruolo=professionista" style={{ textDecoration: "none" }}>
          <Button variant="primary">Iscriviti gratis</Button>
        </Link>
      </YStack>

      <YStack width="100%" maxWidth={1080} paddingVertical="$8" paddingHorizontal="$4" gap="$5">
        <Text fontFamily="$heading" fontWeight="700" fontSize="$8" textAlign="center" color={brand.grafite}>
          Scegli il piano giusto per te
        </Text>

        {error ? (
          <Text color={brand.urgenza} textAlign="center">
            {error}
          </Text>
        ) : null}

        <YStack width="100%" gap="$4" $gtSm={{ flexDirection: "row" }}>
          {plans.map((plan, index) => (
            <Surface
              key={plan.slug}
              flex={1}
              borderWidth={index === 1 ? 2 : 0}
              borderColor={index === 1 ? brand.cianografia : "transparent"}
              borderRadius={radiusDoc}
              padding="$5"
              gap="$4"
            >
              <YStack gap="$1">
                <Text fontFamily="$heading" fontWeight="700" fontSize="$7" color={brand.grafite}>
                  {plan.label}
                </Text>
                <XStack alignItems="baseline" gap="$1">
                  <Text fontFamily="$heading" fontWeight="700" fontSize="$9" color={brand.grafite}>
                    {plan.priceEurCents === 0 ? "€0" : `€${(plan.priceEurCents / 100).toFixed(0)}`}
                  </Text>
                  <Text color={brand.grafite70}>/mese</Text>
                </XStack>
              </YStack>

              <YStack gap="$2">
                {plan.features.map((feature) => (
                  <XStack key={feature} gap="$2" alignItems="flex-start">
                    <Check size={16} strokeWidth={2} color={brand.cianografia} />
                    <Text color={brand.grafite70} flex={1}>
                      {FEATURE_LABELS[feature] ?? feature}
                    </Text>
                  </XStack>
                ))}
              </YStack>

              <Button
                variant={index === 1 ? "primary" : "secondary"}
                onPress={() => handlePlanSelect(plan.slug, plan.priceEurCents)}
                disabled={loadingPlan === plan.slug || isLoading}
                opacity={loadingPlan === plan.slug || isLoading ? 0.6 : 1}
              >
                {loadingPlan === plan.slug ? "Attendi..." : plan.priceEurCents === 0 ? "Inizia gratis" : "Iscriviti"}
              </Button>
            </Surface>
          ))}
        </YStack>
      </YStack>
    </YStack>
  );
}
