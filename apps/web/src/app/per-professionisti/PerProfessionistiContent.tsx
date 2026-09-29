"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { SUBSCRIPTION_FEATURES, SUBSCRIPTION_TIERS } from "@professionisti/shared";
import { Button, Surface, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";

/**
 * Pagina prezzi: abbonamento unico a livelli (CLAUDE.md §6, docs/CHANGELOG.md
 * §161). Tutte le funzioni in ogni livello; cambia solo quanti lavori
 * accettati al mese sono compresi. La scelta del livello si fa da
 * /dashboard/abbonamento, qui solo l'invito a iscriversi. Il mese gratuito
 * non viene annunciato come tale (decisione dell'utente, §162): il livello
 * Base mostra il prezzo barrato e "Gratuito", come un'offerta di benvenuto,
 * con la sola condizione in piccolo per non far credere che resti gratis.
 */
export function PerProfessionistiContent() {
  const { user } = useAuth();
  const ctaHref = user?.isProfessional ? "/dashboard/abbonamento" : "/registrati?ruolo=professionista";
  const ctaLabel = user?.isProfessional ? "Vai al tuo abbonamento" : "Iscriviti gratis";

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso}>
      <YStack width="100%" backgroundColor={brand.cianografiaVelo} paddingVertical="$9" paddingHorizontal="$4" alignItems="center" gap="$4">
        <YStack maxWidth={680} gap="$3" alignItems="center">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$9" textAlign="center" color={brand.grafite}>
            Fatti trovare dai clienti della tua zona
          </Text>
          <Text fontSize="$5" color={brand.grafite70} textAlign="center">
            Ricevi richieste di preventivo, gestisci l&apos;agenda e costruisci la tua reputazione online.
          </Text>
        </YStack>
        <Link href={ctaHref} style={{ textDecoration: "none" }}>
          <Button variant="primary">{ctaLabel}</Button>
        </Link>
      </YStack>

      <YStack width="100%" maxWidth={1080} paddingVertical="$8" paddingHorizontal="$4" gap="$5">
        <YStack gap="$2" alignItems="center">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$8" textAlign="center" color={brand.grafite}>
            Un solo abbonamento, tutte le funzioni
          </Text>
          <Text color={brand.grafite70} textAlign="center" maxWidth={640}>
            I livelli cambiano solo per quanti lavori accettati al mese sono compresi. Un lavoro è accettato quando il
            cliente accetta il tuo preventivo o prenota dalla tua agenda.
          </Text>
        </YStack>

        <YStack width="100%" gap="$4" $gtSm={{ flexDirection: "row" }}>
          {SUBSCRIPTION_TIERS.map((tier) => {
            const highlighted = tier.tier === "PLUS";
            const welcome = tier.tier === "BASE";
            return (
              <Surface
                key={tier.tier}
                flex={1}
                borderWidth={highlighted ? 2 : 0}
                borderColor={highlighted ? brand.cianografia : "transparent"}
                borderRadius={radiusDoc}
                padding="$5"
                gap="$3"
              >
                <XStack alignItems="center" gap="$2" flexWrap="wrap">
                  <Text fontFamily="$heading" fontWeight="700" fontSize="$7" color={brand.grafite}>
                    {tier.label}
                  </Text>
                  {welcome ? (
                    <Text
                      fontSize="$2"
                      fontWeight="700"
                      color="#FFFFFF"
                      backgroundColor={brand.urgenza}
                      paddingHorizontal="$2"
                      paddingVertical={2}
                      borderRadius="$10"
                    >
                      Offerta di benvenuto
                    </Text>
                  ) : null}
                </XStack>
                {welcome ? (
                  <YStack gap="$1">
                    <XStack alignItems="baseline" gap="$2" flexWrap="wrap">
                      <Text fontFamily="$heading" fontSize="$7" color={brand.grafite70} textDecorationLine="line-through">
                        €{(tier.priceEurCents / 100).toFixed(0)}
                      </Text>
                      <Text fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.cianografia}>
                        Gratuito
                      </Text>
                    </XStack>
                    <Text color={brand.grafite70} fontSize="$2">
                      il primo mese, poi €{(tier.priceEurCents / 100).toFixed(0)}/mese
                    </Text>
                  </YStack>
                ) : (
                  <XStack alignItems="baseline" gap="$1">
                    <Text fontFamily="$heading" fontWeight="700" fontSize="$9" color={brand.grafite}>
                      €{(tier.priceEurCents / 100).toFixed(0)}
                    </Text>
                    <Text color={brand.grafite70}>/mese</Text>
                  </XStack>
                )}
                <Text fontWeight="700" color={brand.cianografia}>
                  {tier.monthlyAcceptedJobs === null ? "Lavori senza limite" : `${tier.monthlyAcceptedJobs} lavori accettati al mese`}
                </Text>
              </Surface>
            );
          })}
        </YStack>

        <Surface borderRadius={radiusDoc} padding="$5" gap="$3">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
            Compreso in ogni livello
          </Text>
          <YStack gap="$2" $gtSm={{ flexDirection: "row", flexWrap: "wrap" }}>
            {SUBSCRIPTION_FEATURES.map((feature) => (
              <XStack key={feature} gap="$2" alignItems="flex-start" $gtSm={{ width: "50%" }} paddingRight="$3">
                <Check size={16} strokeWidth={2} color={brand.cianografia} />
                <Text color={brand.grafite70} flex={1}>
                  {feature}
                </Text>
              </XStack>
            ))}
          </YStack>
        </Surface>

        <YStack gap="$2" alignItems="center">
          <Text color={brand.grafite70} textAlign="center" maxWidth={640}>
            Se ti avvicini al limite del tuo livello ti avvisiamo prima, e puoi passare al livello superiore pagando
            solo la differenza. L&apos;abbonamento si rinnova in automatico ogni mese e lo annulli quando vuoi.
          </Text>
          <Text color={brand.grafite70} textAlign="center" maxWidth={640}>
            Pagamenti online: i clienti possono pagarti con carta tramite Stripe, con acconto del 20% e saldo a lavoro finito. Ti
            accreditiamo l&apos;importo alla conferma del cliente o dopo 7 giorni, meno il costo di Stripe e una commissione del 5%. Se il
            cliente paga direttamente, nessuna commissione.
          </Text>
          <Link href={ctaHref} style={{ textDecoration: "none" }}>
            <Button variant="primary">{ctaLabel}</Button>
          </Link>
        </YStack>
      </YStack>
    </YStack>
  );
}
