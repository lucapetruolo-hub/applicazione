"use client";

import Image from "next/image";
import Link from "next/link";
import { Check } from "lucide-react";
import { SUBSCRIPTION_FEATURES, SUBSCRIPTION_TIERS } from "@professionisti/shared";
import { Button, Eyebrow, Icon, Surface, Text, XStack, YStack, brand, radiusDoc, radiusDocLg, type IconName } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { useOnlinePayments } from "@/lib/onlinePayments";

/**
 * Pagina di presentazione per chi offre un servizio (docs/CHANGELOG.md §173,
 * richiesta dell'utente sul modello di Rover "Diventa un sitter" e
 * MioDottore per specialisti): titolo grande con foto, vantaggi, come
 * funziona in 4 passi, prezzi e invito finale. La registrazione vera è in
 * /registrati?ruolo=professionista. Niente testimonianze né numeri finché
 * non ce ne sono di veri.
 *
 * Prezzi: abbonamento unico a livelli (CLAUDE.md §6, docs/CHANGELOG.md
 * §161). Tutte le funzioni in ogni livello; cambia solo quanti lavori
 * accettati al mese sono compresi. La scelta del livello si fa da
 * /dashboard/abbonamento, qui solo l'invito a iscriversi. Il mese gratuito
 * non viene annunciato come tale (decisione dell'utente, §162): il livello
 * Base mostra il prezzo barrato e "Gratuito", come un'offerta di benvenuto,
 * con la sola condizione in piccolo per non far credere che resti gratis.
 */
export function PerProfessionistiContent() {
  const { user } = useAuth();
  const onlinePayments = useOnlinePayments();
  const ctaHref = user?.isProfessional ? "/dashboard/abbonamento" : "/registrati?ruolo=professionista";
  const ctaLabel = user?.isProfessional ? "Vai al tuo abbonamento" : "Iscriviti gratis";

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso}>
      <ProHero ctaHref={ctaHref} ctaLabel={ctaLabel} />
      <ProBenefits />
      <ProSteps />

      <div id="prezzi" style={{ width: "100%", display: "flex", justifyContent: "center", scrollMarginTop: 80 }}>
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
                        <Text fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.cianografiaScuro}>
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
                  <Text fontWeight="700" color={brand.cianografiaScuro}>
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
                  <Check size={16} strokeWidth={2} color={brand.cianografiaScuro} />
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
              {onlinePayments ? "Pagamenti online: i clienti possono pagarti" : "Pagamenti online, in arrivo: i clienti potranno pagarti"} con carta tramite Stripe, con acconto del 20% e saldo a lavoro finito. Ti
              accreditiamo l&apos;importo alla conferma del cliente o dopo 7 giorni, meno il costo di Stripe e una commissione del 5%. Se il
              cliente paga direttamente, nessuna commissione.
            </Text>
          </YStack>
        </YStack>
      </div>

      <ProFinalCta ctaHref={ctaHref} ctaLabel={ctaLabel} />
    </YStack>
  );
}

/** Titolo grande a sinistra, foto a destra (sotto, su telefono). */
function ProHero({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  return (
    <YStack width="100%" alignItems="center" paddingHorizontal="$4" paddingTop="$8" paddingBottom="$8" $gtMd={{ paddingTop: "$10" }}>
      <YStack width="100%" maxWidth={1160} gap="$7" $gtMd={{ flexDirection: "row", alignItems: "center" }}>
        <YStack flex={1} gap="$4">
          <Eyebrow>Per i professionisti</Eyebrow>
          <Text
            tag="h1"
            fontFamily="$heading"
            fontWeight="600"
            fontSize={38}
            lineHeight={42}
            letterSpacing={-0.5}
            color={brand.grafite}
            $gtSm={{ fontSize: 54, lineHeight: 58 }}
          >
            Fatti trovare dai clienti <Text color={brand.cianografiaScuro}>della tua zona</Text>
          </Text>
          <Text fontSize="$6" lineHeight={28} color={brand.grafite70} maxWidth={520}>
            Ricevi richieste di lavoro vicino a te, manda preventivi chiari e gestisci appuntamenti e recensioni in
            un unico posto.
          </Text>
          <XStack gap="$3" flexWrap="wrap" alignItems="center" marginTop="$2">
            <Link href={ctaHref} style={{ textDecoration: "none" }}>
              <Button variant="primary" size="$5">
                {ctaLabel}
              </Button>
            </Link>
            <Link href="#prezzi" style={{ textDecoration: "none" }}>
              <Button variant="secondary" size="$5">
                Vedi i prezzi
              </Button>
            </Link>
          </XStack>
          <XStack gap="$2" alignItems="center">
            <Icon name="shield-check" size={16} color={brand.cianografiaScuro} strokeWidth={1.75} />
            <Text fontSize="$3" color={brand.grafite70}>
              Iscrizione gratuita, nessuna carta richiesta.
            </Text>
          </XStack>
        </YStack>

        <YStack flex={1} width="100%">
          <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 2", borderRadius: radiusDocLg, overflow: "hidden" }}>
            <Image
              src="/category-photos/imbianchino.webp"
              alt="Un imbianchino sorride mentre lavora in un appartamento"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 560px"
              style={{ objectFit: "cover" }}
            />
          </div>
        </YStack>
      </YStack>
    </YStack>
  );
}

const BENEFITS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "map-pin",
    title: "Lavori vicino a te",
    text: "Ti arrivano le richieste dei clienti della tua zona, con foto e descrizione del lavoro.",
  },
  {
    icon: "calendar",
    title: "Agenda e promemoria",
    text: "Gli appuntamenti si prenotano dalla tua agenda e il cliente riceve un promemoria prima.",
  },
  {
    icon: "star",
    title: "Recensioni vere",
    text: "Solo chi ha fatto un lavoro con te può recensirti: la tua reputazione vale di più.",
  },
];

function ProBenefits() {
  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.calce} paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={1080} gap="$6">
        <Text fontFamily="$heading" fontWeight="700" fontSize="$9" textAlign="center" color={brand.grafite}>
          Tutto quello che serve al tuo lavoro
        </Text>
        <YStack gap="$6" $gtSm={{ flexDirection: "row" }}>
          {BENEFITS.map((benefit) => (
            <YStack key={benefit.title} flex={1} gap="$3">
              <XStack width={48} height={48} borderRadius={16} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center">
                <Icon name={benefit.icon} size={22} color={brand.cianografiaScuro} strokeWidth={1.75} />
              </XStack>
              <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
                {benefit.title}
              </Text>
              <Text color={brand.grafite70} lineHeight={22}>
                {benefit.text}
              </Text>
            </YStack>
          ))}
        </YStack>
      </YStack>
    </YStack>
  );
}

const STEPS: { title: string; text: string }[] = [
  { title: "Crea il tuo profilo", text: "Scegli il mestiere, la zona in cui lavori e le prestazioni che offri." },
  { title: "Ricevi le richieste", text: "Ti avvisiamo quando un cliente vicino a te cerca qualcuno come te." },
  { title: "Manda il preventivo", text: "Manodopera, materiali e tempi separati: il cliente sa cosa sta scegliendo." },
  { title: "Lavora e fatti recensire", text: "Quando il cliente accetta vedi i suoi contatti; a lavoro finito può lasciarti una recensione." },
];

function ProSteps() {
  return (
    <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={1080} gap="$6">
        <Text fontFamily="$heading" fontWeight="700" fontSize="$9" textAlign="center" color={brand.grafite}>
          Come funziona
        </Text>
        <YStack gap="$5" $gtSm={{ flexDirection: "row" }}>
          {STEPS.map((step, index) => (
            <YStack key={step.title} flex={1} gap="$2">
              <XStack width={36} height={36} borderRadius={999} backgroundColor={brand.cianografia} alignItems="center" justifyContent="center">
                <Text color="white" fontWeight="700">
                  {index + 1}
                </Text>
              </XStack>
              <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite} marginTop="$2">
                {step.title}
              </Text>
              <Text color={brand.grafite70} lineHeight={22}>
                {step.text}
              </Text>
            </YStack>
          ))}
        </YStack>
      </YStack>
    </YStack>
  );
}

function ProFinalCta({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  return (
    <YStack width="100%" alignItems="center" paddingHorizontal="$4" paddingBottom="$9">
      <YStack
        width="100%"
        maxWidth={1080}
        backgroundColor={brand.cianografia}
        borderRadius={radiusDocLg}
        paddingVertical="$8"
        paddingHorizontal="$5"
        alignItems="center"
        gap="$4"
      >
        <Text fontFamily="$heading" fontWeight="700" fontSize="$9" textAlign="center" color="white">
          Inizia a ricevere richieste
        </Text>
        <Text fontSize="$5" color="rgba(255,255,255,0.9)" textAlign="center" maxWidth={520}>
          Crea l&apos;account in un minuto, poi completi il profilo con calma.
        </Text>
        <Link href={ctaHref} style={{ textDecoration: "none" }}>
          <XStack backgroundColor="white" paddingHorizontal="$6" height={52} alignItems="center" borderRadius={999} cursor="pointer">
            <Text color={brand.cianografiaScuro} fontWeight="700" fontSize="$5">
              {ctaLabel}
            </Text>
          </XStack>
        </Link>
      </YStack>
    </YStack>
  );
}
