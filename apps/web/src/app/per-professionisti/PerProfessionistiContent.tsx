"use client";

import { getImageProps } from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import {
  PROFESSIONAL_CATEGORIES,
  SUBSCRIPTION_FEATURES,
  SUBSCRIPTION_TIERS,
  SAME_CLIENT_ONCE,
  formatEur,
  withVatEurCents,
  ONLINE_APP_FEE_PERCENT,
  type FounderSpots,
  type SubscriptionTier,
} from "@professionisti/shared";
import { Button, ButtonArrow, Icon, Text, XStack, YStack, brand, radiusDoc, type IconName } from "@professionisti/ui";
import { MagneticButton } from "@/components/MagneticButton";
import { GlowLights } from "@/components/GlowLights";
import { useAuth } from "@/lib/AuthContext";
import { useOnlinePayments } from "@/lib/onlinePayments";

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

export function PerProfessionistiContent({ founders = null }: { founders?: FounderSpots | null }) {
  const { user } = useAuth();
  const ctaHref = user?.isProfessional ? "/dashboard/abbonamento" : "/registrati?ruolo=professionista";
  const ctaLabel = user?.isProfessional ? "Vai al tuo abbonamento" : "Iscriviti gratis";

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent">
      <ProHero ctaHref={ctaHref} ctaLabel={ctaLabel} />
      <ProPhoto />
      <ProOnlinePayment />
      <ProBenefits />
      <ProSteps />
      <ProPricing isProfessional={Boolean(user?.isProfessional)} founders={founders} />
      <ProFaq offerMonths={founders?.offerMonths ?? null} />
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
      <YStack width="100%" maxWidth={MAX_WIDTH} borderColor={LINE} borderLeftWidth="gtSm:1px" borderRightWidth="gtSm:1px">
        {children}
      </YStack>
    </div>
  );
}

/** Griglia di celle separate da filetti: lo sfondo è la linea, il `gap` di 1px la mostra. */
function Grid({ children }: { children: ReactNode }) {
  return (
    <YStack width="100%" gap={1} backgroundColor={LINE} borderTopWidth={1} borderColor={LINE} flexDirection="gtSm:row">
      {children}
    </YStack>
  );
}

function Cell({ children, flex = 1 }: { children: ReactNode; flex?: number }) {
  return (
    <YStack flex={flex} flexBasis="gtSm:0px" backgroundColor={brand.gesso} padding="5 gtMd:6" gap="2">
      {children}
    </YStack>
  );
}

function CellTitle({ children }: { children: ReactNode }) {
  return (
    <Text fontFamily="heading" fontWeight="700" fontSize="6" color={brand.grafite}>
      {children}
    </Text>
  );
}

function CellText({ children }: { children: ReactNode }) {
  return (
    <Text color={brand.grafite70} lineHeight="22px">
      {children}
    </Text>
  );
}

function SectionTitle({ children, lead }: { children: ReactNode; lead?: string }) {
  return (
    <YStack paddingHorizontal="5 gtMd:6" paddingVertical="7 gtMd:9" gap="2">
      <Text
        render="h2"
        fontFamily="heading"
        fontWeight="700"
        fontSize="34px gtSm:46px"
        lineHeight="38px gtSm:50px"
        letterSpacing={-0.5}
        color={brand.grafite}
      >
        {children}
      </Text>
      {lead ? (
        <Text color={brand.grafite70} fontSize="5" lineHeight="26px" maxWidth={620}>
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
          position: "relative",
        }}
      >
        {/* Sfumatura che la pagina aveva già (scelta dell'utente), ora con le
            luci che si muovono piano come nella home (docs/CHANGELOG.md §306). */}
        <GlowLights tone="chiaro" pressBoost />
        <YStack position="relative" width="100%" maxWidth={760} alignItems="center" gap="4" paddingHorizontal="4" paddingVertical="10 gtMd:120px">
          <XStack borderWidth={1} borderColor={LINE} borderRadius={999} backgroundColor={brand.calce} overflow="hidden" alignItems="center">
            <Text fontSize={13} color={brand.grafite} paddingHorizontal="3" paddingVertical={6}>
              Con o senza partita IVA
            </Text>
            <Link href="#prezzi" style={{ textDecoration: "none", borderLeft: `1px solid ${LINE}` }}>
              <XStack alignItems="center" gap="1" paddingHorizontal="3" paddingVertical={6} backgroundColor={`hover:${brand.cianografiaVelo}`}>
                <Text fontSize={13} color={brand.cianografiaScuro} fontWeight="600">
                  Vedi i prezzi
                </Text>
                <Icon name="chevron-right" size={14} color={brand.cianografiaScuro} strokeWidth={2} />
              </XStack>
            </Link>
          </XStack>

          <Text
            render="h1"
            fontFamily="heading"
            fontWeight="700"
            fontSize="38px gtSm:54px"
            lineHeight="42px gtSm:56px"
            letterSpacing={-0.8}
            textAlign="center"
            color={brand.grafite}
          >
            Trova nuovi clienti nella tua zona.
          </Text>

          <Text fontSize="6" lineHeight="28px" color={brand.grafite70} textAlign="center" maxWidth={560}>
            Ricevi richieste di lavoro vicino a te, manda preventivi chiari e gestisci appuntamenti e recensioni in un unico posto.
          </Text>

          <XStack gap="3" flexWrap="wrap" justifyContent="center" marginTop="2">
            <Link href="#come-funziona" style={{ textDecoration: "none" }}>
              <Button tabIndex={-1} variant="secondary">Come funziona</Button>
            </Link>
            <Link href={ctaHref} data-glow-boost style={{ textDecoration: "none" }}>
              <MagneticButton>
                <Button variant="primary">{ctaLabel}</Button>
              </MagneticButton>
            </Link>
          </XStack>

          <XStack gap="2" alignItems="center">
            <Icon name="shield-check" size={16} color={brand.cianografiaScuro} strokeWidth={1.75} />
            <Text fontSize={16} color={brand.grafite70}>
              Iscrizione gratuita. La carta serve solo per attivare i mesi gratis.
            </Text>
          </XStack>
        </YStack>
      </div>
    </Band>
  );
}

/**
 * Una schermata vera dell'agenda al posto della foto del lampadario
 * (spunti da miodottore, scelta di Luca,
 * docs/changelog/2026-11-08-trasparenza-chiara-prezzi-in-arrivo.md): chi
 * valuta l'abbonamento vede subito lo strumento che usa ogni giorno. Nomi e
 * appuntamenti sono d'esempio.
 */
const AGENDA_ALT = "L'agenda del professionista: gli appuntamenti del giorno e le ore libere";
const { props: AGENDA_DESKTOP } = getImageProps({
  src: "/page-photos/per-professionisti-agenda.webp",
  alt: AGENDA_ALT,
  width: 1600,
  height: 1168,
  priority: true,
  sizes: "(max-width: 1200px) 100vw, 1100px",
});
const {
  props: { srcSet: agendaPhoneSrcSet },
} = getImageProps({
  src: "/page-photos/per-professionisti-agenda-telefono.webp",
  alt: AGENDA_ALT,
  width: 780,
  height: 975,
  sizes: "100vw",
});
const AGENDA_PHONE = { srcSet: agendaPhoneSrcSet };

function ProPhoto() {
  return (
    <Band>
      <YStack padding="3 gtSm:4">
        <div className="pro-product" style={{ borderRadius: radiusDoc, backgroundColor: brand.cianografia }}>
          {/* Due schermate: la settimana sul computer, la giornata sul telefono
              (docs/changelog/2026-11-08-trasparenza-chiara-prezzi-in-arrivo.md). */}
          <picture className="pro-product-shot">
            <source media="(max-width: 660px)" srcSet={AGENDA_PHONE.srcSet} />
            {/* eslint-disable-next-line jsx-a11y/alt-text -- props (alt compreso) da getImageProps */}
            <img {...AGENDA_DESKTOP} />
          </picture>
        </div>
      </YStack>
    </Band>
  );
}

const PAYMENT_STEPS: { title: string; text: string }[] = [
  { title: "Scegli tu quanto in anticipo", text: "Dall'1 al 100% del preventivo." },
  // "Con l'acconto online": senza, con il pagamento diretto, il lavoro si fissa all'accettazione (docs/changelog/2026-11-08-prova-persone-simulate.md).
  { title: "Con l'acconto, il lavoro si fissa quando paga", text: "Il cliente paga con carta quando accetta il preventivo." },
  { title: "Il bonifico parte alla conferma", text: "Quando il cliente conferma il lavoro, o 7 giorni dopo la fine." },
];

/**
 * Il pagamento online come vantaggio in cima (decisione dell'utente,
 * docs/CHANGELOG.md §361), detto in modo esatto: il cliente paga prima, ma i
 * soldi restano bloccati e il bonifico parte dopo la conferma. Mai "ricevi i
 * soldi prima". Si vede solo con i pagamenti online attivi (§170).
 */
function ProOnlinePayment() {
  const onlinePayments = useOnlinePayments();
  if (!onlinePayments) return null;
  return (
    <Band>
      <YStack gap="6" paddingTop="7 gtMd:8" paddingRight="5 gtMd:8" paddingBottom="7 gtMd:8" paddingLeft="5 gtMd:8" flexDirection="gtSm:row" alignItems="gtSm:center">
        <YStack gap="3" flex="gtSm:1" flexBasis="gtSm:0px" minWidth="gtSm:0px">
          {/* Verde più scuro: sul pesca della banda il verde scuro di sempre si fermava a 4,3:1 (collaudo L-09). */}
          <Text fontSize={13} fontWeight="700" letterSpacing={0.6} textTransform="uppercase" color="#0A6A41">
            Pagamento online
          </Text>
          <Text
            render="h2"
            fontFamily="heading"
            fontWeight="700"
            fontSize="30px gtSm:38px"
            lineHeight="34px gtSm:42px"
            letterSpacing={-0.5}
            color={brand.grafite}
          >
            Il cliente paga l&apos;acconto prima. Tu lavori tranquillo.
          </Text>
          <Text color={brand.grafite70} fontSize="5" lineHeight="26px">
            Se chiedi l&apos;acconto online, il lavoro è fissato solo dopo che il cliente ha pagato.
          </Text>
          <Text color={brand.grafite70} fontSize={15} lineHeight="22px">
            {ONLINE_APP_FEE_PERCENT}% + IVA tutto compreso, solo sui pagamenti online. Il pagamento diretto resta gratis.{" "}
            <Link href="/per-professionisti/pagamenti" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
              Scopri di più
            </Link>
          </Text>
        </YStack>
        <YStack render="ol" margin={0} padding={0} gap="3" flex="gtSm:1" flexBasis="gtSm:0px" minWidth="gtSm:0px">
          {PAYMENT_STEPS.map((step, index) => (
            <XStack
              render="li"
              key={step.title}
              gap="3"
              alignItems="flex-start"
              backgroundColor={brand.calce}
              borderWidth={1}
              borderColor={LINE}
              borderRadius={20}
              padding="4"
            >
              <XStack width={32} height={32} borderRadius={999} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center" flexShrink={0}>
                <Text fontWeight="700" color={brand.cianografiaScuro}>
                  {index + 1}
                </Text>
              </XStack>
              <YStack flex={1} minWidth={0} gap={2}>
                <Text fontWeight="700" color={brand.grafite}>
                  {step.title}
                </Text>
                <Text color={brand.grafite70} lineHeight="22px">
                  {step.text}
                </Text>
              </YStack>
            </XStack>
          ))}
        </YStack>
      </YStack>
    </Band>
  );
}

/** Riquadro bianco con bordo sottile per le piccole illustrazioni delle celle. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <YStack marginTop="4" backgroundColor={brand.calce} borderWidth={1} borderColor={LINE} borderRadius={20} padding="3" gap="2">
      {children}
    </YStack>
  );
}

/**
 * Mini-esempi veri al posto delle righe grigie finte (docs/CHANGELOG.md §349):
 * sembravano contenuti non caricati.
 */
const AGENDA_EXAMPLE: { time: string; job: string; note: string; strong: boolean }[] = [
  { time: "Gio 9:00", job: "Rubinetto cucina", note: "promemoria inviato", strong: true },
  { time: "Gio 14:30", job: "Scarico doccia", note: "a domicilio", strong: false },
  { time: "Ven 10:00", job: "Caldaia", note: "nuova prenotazione", strong: false },
];

function MiniLine({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return (
    <Text fontSize={13} lineHeight="18px" color={strong ? brand.grafite : brand.grafite70} fontWeight={strong ? "600" : "400"} numberOfLines={1}>
      {children}
    </Text>
  );
}

function ProBenefits() {
  return (
    <Band>
      <SectionTitle lead="Un solo posto per trovare lavori, mandare preventivi e tenere in ordine gli appuntamenti. Tutto compreso nell'abbonamento, senza programmi a parte.">
        Tutto quello che serve al tuo lavoro
      </SectionTitle>
      <Grid>
        <Cell flex={2}>
          <CellTitle>Lavori vicino a te</CellTitle>
          <CellText>Ti arrivano le richieste dei clienti della tua zona, con foto e descrizione del lavoro.</CellText>
          <XStack marginTop="4" gap="2" flexWrap="wrap">
            {PROFESSIONAL_CATEGORIES.slice(0, 8).map((category) => (
              <XStack
                key={category.slug}
                alignItems="center"
                gap="2"
                paddingHorizontal="3"
                paddingVertical={6}
                borderRadius={999}
                borderWidth={1}
                borderColor={LINE}
                backgroundColor={brand.calce}
              >
                <Icon name={category.icon as IconName} size={14} color={brand.cianografiaScuro} strokeWidth={1.75} />
                <Text fontSize={13} color={brand.grafite}>
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
            {AGENDA_EXAMPLE.map((item) => (
              <XStack key={item.time} alignItems="center" gap="2">
                <Icon name="clock" size={14} color={item.strong ? brand.cianografiaScuro : brand.grafite70} strokeWidth={1.75} />
                <YStack flex={1} minWidth={0}>
                  <MiniLine strong={item.strong}>
                    {item.time} · {item.job} · {item.note}
                  </MiniLine>
                </YStack>
              </XStack>
            ))}
          </Panel>
        </Cell>
        <Cell>
          <CellTitle>Recensioni vere</CellTitle>
          <CellText>Solo chi ha fatto un lavoro con te può recensirti: la tua reputazione vale di più.</CellText>
          <Panel>
            <XStack gap="1">
              {[0, 1, 2, 3, 4].map((star) => (
                <Icon key={star} name="star" size={16} color={brand.ottone} fill={brand.ottone} strokeWidth={1.5} />
              ))}
            </XStack>
            <MiniLine strong>«Puntuale e pulito, lo richiamerò.»</MiniLine>
            <MiniLine>Giulia R. · Lavoro fatto tramite il sito</MiniLine>
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
            <XStack alignItems="center" justifyContent="space-between" marginBottom="3">
              <Text fontFamily="heading" fontWeight="700" fontSize="7" color={brand.cianografiaScuro}>
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

/** A chi serve ogni livello, una riga sotto il nome. */
const TIER_FOR: Record<SubscriptionTier, string> = {
  BASE: "Per iniziare",
  PLUS: "Per chi lavora tutte le settimane",
  PRO: "Tutti i clienti che arrivano",
};

/**
 * Un pulsante per livello, dentro la sua scheda (docs/CHANGELOG.md §349): prima
 * si sceglieva la scheda e sotto restava un "Scegli un livello" spento, che
 * diceva "non puoi andare avanti". Porta al pagamento del livello (§177): un
 * professionista già iscritto va dritto in Abbonamento, gli altri si
 * iscrivono e poi ci arrivano (`?livello=`).
 *
 * Prezzi + IVA con l'IVA compresa in piccolo (decisioni dell'utente del
 * 26/10/2026, §361). Per ora solo mensile e mesi gratis dell'offerta attiva
 * (decisioni di Luca del 29/10/2026, docs/changelog/2026-10-29-offerta-mesi-gratis.md).
 */
/**
 * Vantaggi di ogni livello in elenco con la spunta. Su Plus e Pro lo stesso
 * cliente conta una volta (§362): su Pro non c'è limite, quindi si dice solo
 * su Plus, con parole che spiegano cosa vuol dire (richiesta di Luca del 2/11/2026).
 */
function tierPerks(tier: (typeof SUBSCRIPTION_TIERS)[number]): string[] {
  if (tier.monthlyAcceptedJobs === null) return ["Lavori senza limite"];
  const jobs = `${tier.monthlyAcceptedJobs} lavori accettati al mese`;
  return tier.tier === "PLUS" ? [jobs, SAME_CLIENT_ONCE] : [jobs];
}

/**
 * Banda verde dell'offerta di lancio (§363, anteprima approvata da Luca):
 * "GRATIS PER 3 MESI" ben in vista con il numero dei posti, 100, mai il
 * conto alla rovescia (decisione dell'utente).
 */
function FounderBand({ spots, months }: { spots: FounderSpots; months: number }) {
  return (
    <XStack
      width="100%"
      backgroundColor={brand.cianografiaPieno}
      paddingHorizontal="5 gtMd:6"
      paddingVertical="4 gtMd:5"
      gap="4"
      alignItems="center"
      justifyContent="space-between"
    >
      <YStack flex={1} gap="1">
        <Text render="p" margin={0} fontFamily="heading" fontWeight="800" fontSize="28px gtSm:40px" lineHeight="32px gtSm:44px" letterSpacing={-0.5} color="white">
          {months === 1 ? "GRATIS PER 1 MESE" : `GRATIS PER ${months} MESI`}
        </Text>
        <Text color="white" fontSize={15} lineHeight="21px">
          Per i primi {spots.total} professionisti che si iscrivono. Poi decidi tu se continuare.
        </Text>
      </YStack>
      {/* Riquadro più scuro della banda, non più chiaro: il bianco sopra resta oltre 4,5:1 (collaudo L-09). */}
      <YStack alignItems="center" backgroundColor="rgba(0,0,0,0.16)" borderRadius={10} paddingHorizontal="3" paddingVertical="2" minWidth={88}>
        <Text fontFamily="heading" fontWeight="800" fontSize={30} lineHeight="34px" color="white">
          {spots.total}
        </Text>
        <Text color="white" fontSize={13}>
          posti
        </Text>
      </YStack>
    </XStack>
  );
}

function ProPricing({ isProfessional, founders }: { isProfessional: boolean; founders: FounderSpots | null }) {
  // Mesi gratis dell'offerta attiva, per tutti; la banda "primi 100" finché restano posti (§363).
  const offerMonths = founders?.offerMonths ?? null;
  const offer = founders && founders.left > 0 && offerMonths ? founders : null;
  return (
    <Band id="prezzi">
      <YStack paddingHorizontal="5 gtMd:6" paddingVertical="7 gtMd:9" gap="4">
        <YStack gap="2">
          <Text
            render="h2"
            fontFamily="heading"
            fontWeight="700"
            fontSize="34px gtSm:46px"
            lineHeight="38px gtSm:50px"
            letterSpacing={-0.5}
            color={brand.grafite}
          >
            Un solo abbonamento, tutte le funzioni
          </Text>
          <Text color={brand.grafite70} fontSize="5" lineHeight="26px" maxWidth={620}>
            I livelli cambiano solo per quanti lavori accettati al mese sono compresi.
          </Text>
        </YStack>
      </YStack>
      {offer && offerMonths ? <FounderBand spots={offer} months={offerMonths} /> : null}
      <Grid>
        {SUBSCRIPTION_TIERS.map((tier) => {
          const welcome = tier.tier === "BASE";
          const monthlyShown = tier.priceEurCents;
          const periodPrice = tier.priceEurCents;
          const per = "al mese";
          const href = isProfessional ? `/dashboard/abbonamento?livello=${tier.tier}` : `/registrati?ruolo=professionista&livello=${tier.tier}`;
          const free = welcome && offerMonths !== null;
          const label = free && !isProfessional ? "Inizia gratis" : `Scegli ${tier.label}`;
          return (
            <YStack
              key={tier.tier}
              flex={1}
              flexBasis="gtSm:0px"
              backgroundColor={free ? brand.calce : brand.gesso}
              borderTopWidth={3}
              borderTopColor={free ? brand.cianografia : "transparent"}
              padding="5 gtMd:6"
              gap="3"
            >
              <YStack gap={2}>
                <XStack alignItems="center" gap="2" flexWrap="wrap">
                  <Text render="h3" margin={0} fontFamily="heading" fontWeight="700" fontSize="7" color={brand.grafite}>
                    {tier.label}
                  </Text>
                  {free ? (
                    // Verde, non rosso: nel sito il rosso vuol dire urgenza o errore (§349).
                    <Text
                      fontSize={13}
                      fontWeight="700"
                      color={brand.cianografiaScuro}
                      backgroundColor={brand.cianografiaVelo}
                      paddingHorizontal="2"
                      paddingVertical={2}
                      borderRadius="10"
                    >
                      {offer ? "Offerta di lancio" : "Offerta di benvenuto"}
                    </Text>
                  ) : null}
                  {tier.tier === "PLUS" ? (
                    // Aiuta chi non sa quale scegliere (richiesta di Luca del 2/11/2026): verde pieno, distinto dall'offerta del Base.
                    <Text
                      fontSize={13}
                      fontWeight="700"
                      color="white"
                      backgroundColor={brand.cianografiaPieno}
                      paddingHorizontal="2"
                      paddingVertical={2}
                      borderRadius="10"
                    >
                      Consigliato
                    </Text>
                  ) : null}
                </XStack>
                <Text color={brand.grafite70} fontSize={15}>
                  {TIER_FOR[tier.tier]}
                </Text>
              </YStack>
              {free ? (
                <YStack gap="1">
                  <XStack alignItems="baseline" gap="2" flexWrap="wrap">
                    <Text fontFamily="heading" fontSize="7" color={brand.grafite70} textDecorationLine="line-through">
                      {formatEur(monthlyShown)}
                    </Text>
                    <Text fontFamily="heading" fontWeight="800" fontSize="9" color={brand.cianografiaScuro}>
                      Gratis
                    </Text>
                    <Text color={brand.grafite70}>{offerMonths === 1 ? "per 1 mese" : `per ${offerMonths} mesi`}</Text>
                  </XStack>
                  <Text color={brand.grafite70} fontSize={13}>
                    poi {formatEur(periodPrice)} {per} + IVA, in automatico
                  </Text>
                </YStack>
              ) : (
                <YStack gap="1">
                  <XStack alignItems="baseline" gap="2" flexWrap="wrap">
                    <Text fontFamily="heading" fontWeight="700" fontSize="9" color={brand.grafite}>
                      {formatEur(monthlyShown)}
                    </Text>
                    <Text color={brand.grafite70}>al mese + IVA</Text>
                  </XStack>
                  <Text color={brand.grafite70} fontSize={13}>
                    IVA inclusa: {formatEur(withVatEurCents(periodPrice))} {per}
                  </Text>
                </YStack>
              )}
              {/* Cosa dà il livello, con la spunta come "Compreso in ogni livello": su Plus si vede subito cosa c'è in più rispetto a Base. */}
              <YStack render="ul" margin={0} padding={0} gap="2" style={{ listStyle: "none" }}>
                {tierPerks(tier).map((perk) => (
                  <XStack key={perk} render="li" gap="2" alignItems="flex-start">
                    <Check size={18} strokeWidth={2.25} color={brand.cianografiaScuro} aria-hidden style={{ flexShrink: 0, marginTop: 3 }} />
                    <Text flex={1} fontWeight="700" color={brand.cianografiaScuro}>
                      {perk}
                    </Text>
                  </XStack>
                ))}
              </YStack>
              <YStack flex={1} />
              <Link href={href} style={{ textDecoration: "none" }} aria-label={`${label}${isProfessional ? "" : ": iscriviti come professionista"}`}>
                <Button tabIndex={-1} variant="acquisto" width="100%">
                  <XStack alignItems="center" gap="2">
                    <Text color="white" fontFamily="body" fontWeight="600">
                      {label}
                    </Text>
                    <ButtonArrow tone="red" />
                  </XStack>
                </Button>
              </Link>
              <Text fontSize={13} color={brand.grafite70} textAlign="center">
                Nessun vincolo, annulli quando vuoi
              </Text>
            </YStack>
          );
        })}
      </Grid>
      <YStack borderTopWidth={1} borderColor={LINE} padding="5 gtMd:6" gap="3">
        <CellTitle>Compreso in ogni livello</CellTitle>
        <YStack gap="2" flexDirection="gtSm:row" flexWrap="gtSm:wrap">
          {SUBSCRIPTION_FEATURES.map((feature) => (
            <XStack key={feature} gap="2" alignItems="flex-start" width="gtSm:50%" paddingRight="3">
              <Check size={16} strokeWidth={2} color={brand.cianografiaScuro} />
              <Text color={brand.grafite70} flex={1}>
                {feature}
              </Text>
            </XStack>
          ))}
        </YStack>
      </YStack>
      <YStack borderTopWidth={1} borderColor={LINE} padding="4" alignItems="center" gap="1">
        <Text fontSize={15} color={brand.grafite70} textAlign="center">
          Prezzi IVA esclusa: l&apos;IVA del 22% si aggiunge in fattura.
        </Text>
        <Text fontSize={15} color={brand.grafite70} textAlign="center">
          {isProfessional ? "Poi confermi il livello e il pagamento." : "Ti iscrivi, poi confermi il livello e il pagamento."}
        </Text>
      </YStack>
    </Band>
  );
}

/** Solo fatti già decisi e in funzione (CLAUDE.md §5 punto 9, §6). */
const FAQ: { question: string; answer: string; paymentsLink?: boolean; founderOffer?: boolean }[] = [
  {
    // "N" diventa i mesi dell'offerta attiva (docs/changelog/2026-10-29-offerta-mesi-gratis.md).
    question: "Come funzionano i N mesi gratis?",
    answer:
      "Il livello Base è gratis per N, a partire dal lancio del sito. Per attivarli aggiungi la carta: oggi non paghi nulla e alla fine parte Base a 19 € + IVA al mese, in automatico, con un avviso qualche giorno prima. Annulli quando vuoi. Se ti servono più lavori puoi passare a Plus o Pro anche durante i mesi gratis: paghi il primo mese meno 19 €, e i mesi gratis che restano ti aspettano se torni a Base.",
    founderOffer: true,
  },
  {
    question: "Quando vedo i contatti del cliente?",
    answer: "Quando il cliente accetta il tuo preventivo. Prima vedi la città, la descrizione del lavoro, le foto e la vostra chat.",
  },
  {
    question: "Cosa succede se arrivo al limite di lavori del mio livello?",
    answer:
      "Ti avvisiamo prima. Resti nelle ricerche e ricevi le richieste, ma per mandare preventivi nuovi passi al livello sopra: paghi 10 € più la differenza di prezzo per i giorni che mancano al rinnovo, maggiorata del 10% (+ IVA). Altrimenti aspetti il rinnovo, quando i lavori ripartono. I preventivi già mandati restano validi. Su Plus e Pro più lavori allo stesso cliente nello stesso mese contano come uno.",
  },
  {
    question: "I prezzi comprendono l'IVA?",
    answer: "No: sono IVA esclusa e l'IVA del 22% si aggiunge in fattura. Sotto ogni prezzo trovi anche il totale con l'IVA.",
  },
  {
    question: "Posso annullare l'abbonamento?",
    answer: "Sì, quando vuoi dalla pagina Abbonamento. Resta attivo fino alla fine del mese o dell'anno già pagato.",
  },
  {
    question: "Chi può lasciarmi una recensione?",
    answer: "Solo un cliente che ha prenotato un lavoro con te sul sito.",
  },
  {
    question: "Come vengo pagato dai clienti?",
    answer: "Il cliente sceglie se pagarti online con carta o direttamente a te.",
    paymentsLink: true,
  },
];

function ProFaq({ offerMonths }: { offerMonths: number | null }) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  return (
    <Band>
      <YStack gap={1} backgroundColor={LINE} flexDirection="gtSm:row">
        <YStack backgroundColor={brand.gesso} paddingTop="7 gtMd:8" paddingRight="5 gtMd:8" paddingBottom="7 gtMd:8" paddingLeft="5 gtMd:8" gap="3" width="gtSm:50%">
          <Text
            render="h2"
            fontFamily="heading"
            fontWeight="700"
            fontSize="34px gtSm:46px"
            lineHeight="38px gtSm:50px"
            letterSpacing={-0.5}
            color={brand.grafite}
          >
            Domande frequenti
          </Text>
          <Text color={brand.grafite70} fontSize="5" lineHeight="26px">
            Non trovi la risposta?{" "}
            <Link href="/contatti" style={{ color: brand.cianografiaScuro, fontWeight: 700 }}>
              Scrivici
            </Link>
            .
          </Text>
        </YStack>
        <YStack backgroundColor={brand.gesso} flexGrow={1} width="gtSm:50%">
          <div className="pro-faq">
            {FAQ.filter((item) => !item.founderOffer || offerMonths).map((item, index) => (
              <details key={item.question} className="pro-faq-item" open={index === 0}>
                <summary>{item.founderOffer ? item.question.replace("N mesi", offerMonths === 1 ? "1 mese" : `${offerMonths} mesi`) : item.question}</summary>
                <p>
                  {item.founderOffer ? item.answer.replace("per N,", offerMonths === 1 ? "per 1 mese," : `per ${offerMonths} mesi,`) : item.answer}
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
    <YStack width="100%" alignItems="center" paddingBottom="9">
      <Band last>
        <YStack alignItems="center" gap="4" paddingHorizontal="4" paddingVertical="9 gtMd:10">
          <Text
            render="h2"
            fontFamily="heading"
            fontWeight="700"
            fontSize="32px gtSm:44px"
            lineHeight="38px gtSm:50px"
            letterSpacing={-0.5}
            textAlign="center"
            color={brand.grafite}
          >
            Inizia a ricevere richieste
          </Text>
          <Text fontSize="5" color={brand.grafite70} textAlign="center" maxWidth={520}>
            Scegli il tuo livello e crea l&apos;account in un minuto, poi completi il profilo con calma.
          </Text>
          <XStack gap="3" flexWrap="wrap" justifyContent="center">
            <Link href="/per-professionisti/pagamenti" style={{ textDecoration: "none" }}>
              <Button tabIndex={-1} variant="secondary">Scopri di più</Button>
            </Link>
            <Link href="#prezzi" style={{ textDecoration: "none" }}>
              <Button tabIndex={-1} variant="primary">Scegli il tuo livello</Button>
            </Link>
          </XStack>
          {/* Per chi non è a suo agio col computer: un operatore crea il
              profilo al telefono (CLAUDE.md §8). Porta al modulo Contatti già
              avviato, la stessa strada di sempre (docs/changelog/2026-11-08-trasparenza-chiara-prezzi-in-arrivo.md). */}
          <Text fontSize={16} color={brand.grafite70} textAlign="center">
            Preferisci farti aiutare al telefono?{" "}
            <Link href="/contatti?motivo=aiuto-profilo" style={{ color: brand.cianografiaScuro, fontWeight: 600 }}>
              Lasciaci il numero, ti richiamiamo
            </Link>
          </Text>
          {/* Una pagina per lavoro, per chi cerca "lavoro pulizie" su Google (docs/CHANGELOG.md §296). */}
          <nav className="work-links" aria-label="Lavora con noi">
            <span>Lavora con noi come:</span>
            {PROFESSIONAL_CATEGORIES.map((category) => (
              <Link key={category.slug} href={`/lavora-con-noi/${category.slug}`}>
                {category.label}
              </Link>
            ))}
          </nav>
        </YStack>
      </Band>
    </YStack>
  );
}
