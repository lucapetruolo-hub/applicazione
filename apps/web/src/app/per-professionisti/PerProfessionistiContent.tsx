"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { PROFESSIONAL_CATEGORIES, SUBSCRIPTION_FEATURES, SUBSCRIPTION_TIERS, type SubscriptionTier } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand, radiusDoc, type IconName } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";

/**
 * Pagina di presentazione per chi offre un servizio (docs/CHANGELOG.md §173,
 * richiesta dell'utente sul modello di Rover "Diventa un sitter" e
 * MioDottore per specialisti). La registrazione vera è in
 * /registrati?ruolo=professionista. Niente testimonianze né numeri finché
 * non ce ne sono di veri.
 *
 * Aspetto ispirato a efferd.com (docs/CHANGELOG.md §175, richiesta
 * dell'utente): pagina incorniciata da linee sottili, titolo centrato a due
 * toni, celle a mosaico separate da filetti (sfondo della griglia = colore
 * della linea, `gap={1}`), domande frequenti su due colonne e invito finale
 * semplice con due pulsanti. Colori e caratteri restano quelli del sito.
 *
 * Prezzi: abbonamento unico a livelli (CLAUDE.md §6, docs/CHANGELOG.md
 * §161). Tutte le funzioni in ogni livello; cambia solo quanti lavori
 * accettati al mese sono compresi. La scelta del livello si fa da
 * /dashboard/abbonamento, qui solo l'invito a iscriversi. Il mese gratuito
 * non viene annunciato come tale (decisione dell'utente, §162): il livello
 * Base mostra il prezzo barrato e "Gratuito", con la sola condizione in
 * piccolo. La cella evidenziata è quella che l'utente tocca, non una fissa
 * (§174).
 */

/** Colore dei filetti della griglia. */
const LINE = "rgba(43,36,32,0.12)";
const MAX_WIDTH = 1160;

export function PerProfessionistiContent() {
  const { user } = useAuth();
  const ctaHref = user?.isProfessional ? "/dashboard/abbonamento" : "/registrati?ruolo=professionista";
  const ctaLabel = user?.isProfessional ? "Vai al tuo abbonamento" : "Iscriviti gratis";

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent">
      <ProHero ctaHref={ctaHref} ctaLabel={ctaLabel} />
      <ProPhoto />
      <ProBenefits />
      <ProSteps />
      <ProPricing isProfessional={Boolean(user?.isProfessional)} />
      <ProFaq />
      <ProFinalCta />
    </YStack>
  );
}

/**
 * Fascia a tutta larghezza con filetto in alto e, da tablet in su, cornice
 * verticale ai lati del contenuto (le linee lunghe di efferd).
 */
function Band({ children, id, last }: { children: ReactNode; id?: string; last?: boolean }) {
  return (
    <div
      id={id}
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        scrollMarginTop: 80,
        borderTop: `1px solid ${LINE}`,
        borderBottom: last ? `1px solid ${LINE}` : undefined,
      }}
    >
      <YStack width="100%" maxWidth={MAX_WIDTH} borderColor={LINE} $gtSm={{ borderLeftWidth: 1, borderRightWidth: 1 }}>
        {children}
      </YStack>
    </div>
  );
}

/** Griglia di celle separate da filetti: lo sfondo è la linea, il `gap` di 1px la mostra. */
function Grid({ children }: { children: ReactNode }) {
  return (
    <YStack width="100%" gap={1} backgroundColor={LINE} borderTopWidth={1} borderColor={LINE} $gtSm={{ flexDirection: "row" }}>
      {children}
    </YStack>
  );
}

function Cell({ children, flex = 1 }: { children: ReactNode; flex?: number }) {
  return (
    <YStack flex={flex} $gtSm={{ flexBasis: 0 }} backgroundColor={brand.gesso} padding="$5" gap="$2" $gtMd={{ padding: "$6" }}>
      {children}
    </YStack>
  );
}

function CellTitle({ children }: { children: ReactNode }) {
  return (
    <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color={brand.grafite}>
      {children}
    </Text>
  );
}

function CellText({ children }: { children: ReactNode }) {
  return (
    <Text color={brand.grafite70} lineHeight={22}>
      {children}
    </Text>
  );
}

function SectionTitle({ children, lead }: { children: ReactNode; lead?: string }) {
  return (
    <YStack paddingHorizontal="$5" paddingVertical="$7" gap="$2" $gtMd={{ paddingHorizontal: "$6", paddingVertical: "$9" }}>
      <Text
        tag="h2"
        fontFamily="$heading"
        fontWeight="700"
        fontSize={34}
        lineHeight={38}
        letterSpacing={-0.5}
        color={brand.grafite}
        $gtSm={{ fontSize: 46, lineHeight: 50 }}
      >
        {children}
      </Text>
      {lead ? (
        <Text color={brand.grafite70} fontSize="$5" lineHeight={26} maxWidth={620}>
          {lead}
        </Text>
      ) : null}
    </YStack>
  );
}

/** Titolo centrato a due toni con alone verde, pillola sopra e due pulsanti. */
function ProHero({ ctaHref, ctaLabel }: { ctaHref: string; ctaLabel: string }) {
  return (
    <Band>
      <div
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "center",
          background: "radial-gradient(ellipse 60% 55% at 50% 50%, rgba(24,154,99,0.13), rgba(24,154,99,0) 70%)",
        }}
      >
        <YStack width="100%" maxWidth={760} alignItems="center" gap="$4" paddingHorizontal="$4" paddingVertical="$10" $gtMd={{ paddingVertical: 120 }}>
          <XStack borderWidth={1} borderColor={LINE} borderRadius={999} backgroundColor={brand.calce} overflow="hidden" alignItems="center">
            <Text fontSize="$2" color={brand.grafite} paddingHorizontal="$3" paddingVertical={6}>
              Per i professionisti
            </Text>
            <Link href="#prezzi" style={{ textDecoration: "none", borderLeft: `1px solid ${LINE}` }}>
              <XStack alignItems="center" gap="$1" paddingHorizontal="$3" paddingVertical={6} hoverStyle={{ backgroundColor: brand.cianografiaVelo }}>
                <Text fontSize="$2" color={brand.cianografiaScuro} fontWeight="600">
                  Vedi i prezzi
                </Text>
                <Icon name="chevron-right" size={14} color={brand.cianografiaScuro} strokeWidth={2} />
              </XStack>
            </Link>
          </XStack>

          <Text
            tag="h1"
            fontFamily="$heading"
            fontWeight="700"
            fontSize={38}
            lineHeight={44}
            letterSpacing={-0.8}
            textAlign="center"
            color={brand.grafite70}
            $gtSm={{ fontSize: 60, lineHeight: 66 }}
          >
            Fatti trovare <Text color={brand.grafite}>dai clienti</Text>{" "}
            <Text color={brand.cianografiaScuro}>della tua zona.</Text>
          </Text>

          <Text fontSize="$6" lineHeight={28} color={brand.grafite70} textAlign="center" maxWidth={560}>
            Ricevi richieste di lavoro vicino a te, manda preventivi chiari e gestisci appuntamenti e recensioni in un unico posto.
          </Text>

          <XStack gap="$3" flexWrap="wrap" justifyContent="center" marginTop="$2">
            <Link href="#come-funziona" style={{ textDecoration: "none" }}>
              <Button variant="secondary">Come funziona</Button>
            </Link>
            <Link href={ctaHref} style={{ textDecoration: "none" }}>
              <Button variant="primary">{ctaLabel}</Button>
            </Link>
          </XStack>

          <XStack gap="$2" alignItems="center">
            <Icon name="shield-check" size={16} color={brand.cianografiaScuro} strokeWidth={1.75} />
            <Text fontSize="$3" color={brand.grafite70}>
              Iscrizione gratuita, nessuna carta richiesta.
            </Text>
          </XStack>
        </YStack>
      </div>
    </Band>
  );
}

function ProPhoto() {
  return (
    <Band>
      <YStack padding="$3" $gtSm={{ padding: "$4" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "21 / 9",
            minHeight: 220,
            borderRadius: radiusDoc,
            overflow: "hidden",
            border: `1px solid ${LINE}`,
          }}
        >
          <Image
            src="/category-photos/imbianchino.webp"
            alt="Un imbianchino sorride mentre lavora in un appartamento"
            fill
            priority
            sizes="(max-width: 1200px) 100vw, 1160px"
            style={{ objectFit: "cover" }}
          />
        </div>
      </YStack>
    </Band>
  );
}

/** Riquadro bianco con bordo sottile per le piccole illustrazioni delle celle. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <YStack marginTop="$4" backgroundColor={brand.calce} borderWidth={1} borderColor={LINE} borderRadius={14} padding="$3" gap="$2">
      {children}
    </YStack>
  );
}

/** Barra "segnaposto", come le anteprime astratte di efferd. */
function Bar({ width, strong }: { width: `${number}%`; strong?: boolean }) {
  return <YStack height={8} width={width} borderRadius={999} backgroundColor={strong ? brand.cianografiaVelo : "rgba(43,36,32,0.08)"} />;
}

const AGENDA_BARS: { width: `${number}%`; strong: boolean }[] = [
  { width: "70%", strong: true },
  { width: "50%", strong: false },
  { width: "60%", strong: false },
];

function ProBenefits() {
  return (
    <Band>
      <SectionTitle lead="Un solo posto per trovare lavori, mandare preventivi e tenere in ordine gli appuntamenti.">
        Tutto quello che serve al tuo lavoro
      </SectionTitle>
      <Grid>
        <Cell flex={2}>
          <CellTitle>Lavori vicino a te</CellTitle>
          <CellText>Ti arrivano le richieste dei clienti della tua zona, con foto e descrizione del lavoro.</CellText>
          <XStack marginTop="$4" gap="$2" flexWrap="wrap">
            {PROFESSIONAL_CATEGORIES.slice(0, 8).map((category) => (
              <XStack
                key={category.slug}
                alignItems="center"
                gap="$2"
                paddingHorizontal="$3"
                paddingVertical={6}
                borderRadius={999}
                borderWidth={1}
                borderColor={LINE}
                backgroundColor={brand.calce}
              >
                <Icon name={category.icon as IconName} size={14} color={brand.cianografiaScuro} strokeWidth={1.75} />
                <Text fontSize="$2" color={brand.grafite}>
                  {category.label}
                </Text>
              </XStack>
            ))}
          </XStack>
        </Cell>
        <Cell>
          <CellTitle>Agenda e promemoria</CellTitle>
          <CellText>Gli appuntamenti si prenotano dalla tua agenda e il cliente riceve un promemoria prima.</CellText>
          <Panel>
            {AGENDA_BARS.map((bar, index) => (
              <XStack key={index} alignItems="center" gap="$2">
                <Icon name="clock" size={14} color={bar.strong ? brand.cianografiaScuro : brand.grafite70} strokeWidth={1.75} />
                <Bar width={bar.width} strong={bar.strong} />
              </XStack>
            ))}
          </Panel>
        </Cell>
        <Cell>
          <CellTitle>Recensioni vere</CellTitle>
          <CellText>Solo chi ha fatto un lavoro con te può recensirti: la tua reputazione vale di più.</CellText>
          <Panel>
            <XStack gap="$1">
              {[0, 1, 2, 3, 4].map((star) => (
                <Icon key={star} name="star" size={16} color={brand.ottone} fill={brand.ottone} strokeWidth={1.5} />
              ))}
            </XStack>
            <Bar width="85%" />
            <Bar width="55%" />
          </Panel>
        </Cell>
      </Grid>
    </Band>
  );
}

const STEPS: { title: string; text: string; icon: IconName }[] = [
  { title: "Crea il tuo profilo", text: "Scegli il mestiere, la zona in cui lavori e le prestazioni che offri.", icon: "user-round" },
  { title: "Ricevi le richieste", text: "Ti avvisiamo quando un cliente vicino a te cerca qualcuno come te.", icon: "bell-ring" },
  { title: "Manda il preventivo", text: "Manodopera, materiali e tempi separati: il cliente sa cosa sta scegliendo.", icon: "receipt-text" },
  {
    title: "Lavora e fatti recensire",
    text: "Quando il cliente accetta vedi i suoi contatti; a lavoro finito può lasciarti una recensione.",
    icon: "star",
  },
];

function ProSteps() {
  return (
    <Band id="come-funziona">
      <SectionTitle>Come funziona</SectionTitle>
      <Grid>
        {STEPS.map((step, index) => (
          <Cell key={step.title}>
            <XStack alignItems="center" justifyContent="space-between" marginBottom="$3">
              <Text fontFamily="$heading" fontWeight="700" fontSize="$7" color={brand.cianografiaScuro}>
                {String(index + 1).padStart(2, "0")}
              </Text>
              <XStack
                width={36}
                height={36}
                borderRadius={999}
                borderWidth={1}
                borderColor={LINE}
                backgroundColor={brand.calce}
                alignItems="center"
                justifyContent="center"
              >
                <Icon name={step.icon} size={16} color={brand.grafite} strokeWidth={1.75} />
              </XStack>
            </XStack>
            <CellTitle>{step.title}</CellTitle>
            <CellText>{step.text}</CellText>
          </Cell>
        ))}
      </Grid>
    </Band>
  );
}

/**
 * Il pulsante sotto i livelli porta al pagamento di quello scelto
 * (docs/CHANGELOG.md §177): un professionista già iscritto va dritto in
 * Abbonamento, gli altri si iscrivono e poi ci arrivano (`?livello=`).
 */
function ProPricing({ isProfessional }: { isProfessional: boolean }) {
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null);
  const selectedLabel = selectedTier ? SUBSCRIPTION_TIERS.find((t) => t.tier === selectedTier)?.label : null;
  const continueHref = selectedTier
    ? isProfessional
      ? `/dashboard/abbonamento?livello=${selectedTier}`
      : `/registrati?ruolo=professionista&livello=${selectedTier}`
    : null;
  return (
    <Band id="prezzi">
      <SectionTitle lead="I livelli cambiano solo per quanti lavori accettati al mese sono compresi. Un lavoro è accettato quando il cliente accetta il tuo preventivo o prenota dalla tua agenda.">
        Un solo abbonamento, tutte le funzioni
      </SectionTitle>
      <Grid>
        {SUBSCRIPTION_TIERS.map((tier) => {
          const selected = selectedTier === tier.tier;
          const welcome = tier.tier === "BASE";
          const price = (tier.priceEurCents / 100).toFixed(0);
          return (
            <YStack
              key={tier.tier}
              flex={1}
              $gtSm={{ flexBasis: 0 }}
              backgroundColor={selected ? brand.calce : brand.gesso}
              borderTopWidth={3}
              borderTopColor={selected ? brand.cianografia : "transparent"}
              padding="$5"
              gap="$3"
              cursor="pointer"
              hoverStyle={{ backgroundColor: brand.calce }}
              accessibilityRole="radio"
              aria-checked={selected}
              onPress={() => setSelectedTier(tier.tier)}
              $gtMd={{ padding: "$6" }}
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
                      €{price}
                    </Text>
                    <Text fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.cianografiaScuro}>
                      Gratuito
                    </Text>
                  </XStack>
                  <Text color={brand.grafite70} fontSize="$2">
                    il primo mese, poi €{price}/mese
                  </Text>
                </YStack>
              ) : (
                <XStack alignItems="baseline" gap="$1">
                  <Text fontFamily="$heading" fontWeight="700" fontSize="$9" color={brand.grafite}>
                    €{price}
                  </Text>
                  <Text color={brand.grafite70}>/mese</Text>
                </XStack>
              )}
              <Text fontWeight="700" color={brand.cianografiaScuro}>
                {tier.monthlyAcceptedJobs === null ? "Lavori senza limite" : `${tier.monthlyAcceptedJobs} lavori accettati al mese`}
              </Text>
            </YStack>
          );
        })}
      </Grid>
      <YStack borderTopWidth={1} borderColor={LINE} padding="$5" gap="$2" alignItems="center" $gtMd={{ padding: "$6" }}>
        {continueHref ? (
          <Link href={continueHref} style={{ textDecoration: "none" }}>
            <Button variant="primary" size="$5">
              {isProfessional ? `Continua con ${selectedLabel}` : `Iscriviti con ${selectedLabel}`}
            </Button>
          </Link>
        ) : (
          <Button variant="primary" size="$5" disabled opacity={0.5}>
            Scegli un livello
          </Button>
        )}
        <Text fontSize="$3" color={brand.grafite70} textAlign="center">
          {continueHref ? "Poi confermi il livello e il pagamento." : "Tocca uno dei livelli qui sopra per continuare."}
        </Text>
      </YStack>
      <YStack borderTopWidth={1} borderColor={LINE} padding="$5" gap="$3" $gtMd={{ padding: "$6" }}>
        <CellTitle>Compreso in ogni livello</CellTitle>
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
        <Text color={brand.grafite70} marginTop="$2" maxWidth={720} lineHeight={22}>
          Se ti avvicini al limite del tuo livello ti avvisiamo prima, e puoi passare al livello superiore pagando solo la differenza.
          L&apos;abbonamento si rinnova in automatico ogni mese e lo annulli quando vuoi.
        </Text>
      </YStack>
    </Band>
  );
}

/** Solo fatti già decisi e in funzione (CLAUDE.md §5 punto 9, §6). */
const FAQ: { question: string; answer: string; paymentsLink?: boolean }[] = [
  {
    question: "Quando vedo i contatti del cliente?",
    answer: "Quando il cliente accetta il tuo preventivo. Prima vedi la città, la descrizione del lavoro, le foto e la vostra chat.",
  },
  {
    question: "Cosa succede se arrivo al limite di lavori del mio livello?",
    answer: "Ti avvisiamo prima. Puoi passare al livello superiore pagando solo la differenza, altrimenti i lavori ripartono il primo del mese.",
  },
  {
    question: "Posso annullare l'abbonamento?",
    answer: "Sì, quando vuoi dalla pagina Abbonamento. Resta attivo fino alla scadenza del mese in corso.",
  },
  {
    question: "Chi può lasciarmi una recensione?",
    answer: "Solo un cliente con cui hai fatto un lavoro prenotato sulla piattaforma e segnato come completato.",
  },
  {
    question: "Come vengo pagato dai clienti?",
    answer: "Il cliente sceglie se pagarti online con carta o direttamente a te.",
    paymentsLink: true,
  },
];

function ProFaq() {
  return (
    <Band>
      <YStack gap={1} backgroundColor={LINE} $gtSm={{ flexDirection: "row" }}>
        <YStack backgroundColor={brand.gesso} padding="$5" paddingVertical="$7" gap="$3" $gtSm={{ width: "50%" }} $gtMd={{ padding: "$8" }}>
          <Text
            tag="h2"
            fontFamily="$heading"
            fontWeight="700"
            fontSize={34}
            lineHeight={38}
            letterSpacing={-0.5}
            color={brand.grafite}
            $gtSm={{ fontSize: 46, lineHeight: 50 }}
          >
            Domande frequenti
          </Text>
          <Text color={brand.grafite70} fontSize="$5" lineHeight={26}>
            Non trovi la risposta?{" "}
            <Link href="/contatti" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
              Scrivici
            </Link>
            .
          </Text>
        </YStack>
        <YStack backgroundColor={brand.gesso} flexGrow={1} $gtSm={{ width: "50%" }}>
          <div className="pro-faq">
            {FAQ.map((item, index) => (
              <details key={item.question} className="pro-faq-item" open={index === 0}>
                <summary>{item.question}</summary>
                <p>
                  {item.answer}
                  {item.paymentsLink ? (
                    <>
                      {" "}
                      <Link href="/per-professionisti/pagamenti" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
                        Scopri di più
                      </Link>
                    </>
                  ) : null}
                </p>
              </details>
            ))}
          </div>
        </YStack>
      </YStack>
      <style jsx>{`
        .pro-faq {
          display: flex;
          flex-direction: column;
        }
        .pro-faq-item {
          border-bottom: 1px solid ${LINE};
          padding: 20px 24px;
        }
        .pro-faq-item summary {
          cursor: pointer;
          list-style: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          font-weight: 600;
          color: ${brand.grafite};
        }
        .pro-faq-item summary::-webkit-details-marker {
          display: none;
        }
        .pro-faq-item summary::after {
          content: "+";
          font-size: 22px;
          line-height: 1;
          color: ${brand.grafite70};
        }
        .pro-faq-item[open] summary::after {
          content: "−";
        }
        .pro-faq-item p {
          margin: 10px 0 0;
          color: ${brand.grafite70};
          line-height: 1.6;
        }
      `}</style>
    </Band>
  );
}

/**
 * Invito finale semplice come quello di efferd: titolo a due toni e due
 * pulsanti, "Scopri di più" sui pagamenti (§174) e il ritorno alla scelta
 * del livello, dove ora sta il pulsante per iscriversi (§177).
 */
function ProFinalCta() {
  return (
    <YStack width="100%" alignItems="center" paddingBottom="$9">
      <Band last>
        <YStack alignItems="center" gap="$4" paddingHorizontal="$4" paddingVertical="$9" $gtMd={{ paddingVertical: "$10" }}>
          <Text
            tag="h2"
            fontFamily="$heading"
            fontWeight="700"
            fontSize={32}
            lineHeight={38}
            letterSpacing={-0.5}
            textAlign="center"
            color={brand.grafite70}
            $gtSm={{ fontSize: 44, lineHeight: 50 }}
          >
            <Text color={brand.grafite}>Inizia</Text> a ricevere <Text color={brand.cianografiaScuro}>richieste</Text>
          </Text>
          <Text fontSize="$5" color={brand.grafite70} textAlign="center" maxWidth={520}>
            Scegli il tuo livello e crea l&apos;account in un minuto, poi completi il profilo con calma.
          </Text>
          <XStack gap="$3" flexWrap="wrap" justifyContent="center">
            <Link href="/per-professionisti/pagamenti" style={{ textDecoration: "none" }}>
              <Button variant="secondary">Scopri di più</Button>
            </Link>
            <Link href="#prezzi" style={{ textDecoration: "none" }}>
              <Button variant="primary">Scegli il tuo livello</Button>
            </Link>
          </XStack>
        </YStack>
      </Band>
    </YStack>
  );
}
