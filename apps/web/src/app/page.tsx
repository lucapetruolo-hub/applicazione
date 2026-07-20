"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PROFESSIONAL_CATEGORIES, findCategoryByQuery } from "@professionisti/shared";
import {
  Hero,
  CategoryChips,
  IconFeature,
  TestimonialCard,
  ProfessionalCard,
  Button,
  H2,
  Paragraph,
  Text,
  XStack,
  YStack,
} from "@professionisti/ui";

// Sotto-servizi in evidenza: campione flat dei subTags di ogni categoria.
const FEATURED_SUB_SERVICES = PROFESSIONAL_CATEGORIES.flatMap((category) =>
  category.subTags.map((tag) => ({
    key: `${category.slug}:${tag}`,
    label: tag.replace(/-/g, " "),
    parentSlug: category.slug,
  })),
).slice(0, 14);

// Dati di esempio: da sostituire con recensioni/professionisti reali quando la piattaforma avrà utenti.
const PROFESSIONAL_TIPS = [
  {
    authorName: "Marco T.",
    authorRole: "Idraulico, Latina",
    text: "Rispondere velocemente alle richieste fa la differenza: spesso il primo professionista che risponde si aggiudica il lavoro.",
  },
  {
    authorName: "Giulia F.",
    authorRole: "Elettricista, Roma",
    text: "Il preventivo strutturato evita fraintendimenti col cliente su materiali e tempistiche prima di iniziare.",
  },
];

const CLIENT_REVIEWS = [
  { authorName: "Luca B.", rating: 5, text: "Professionista puntuale e disponibile, lavoro fatto in giornata." },
  { authorName: "Sara M.", rating: 5, text: "Preventivo chiaro, nessuna sorpresa sul prezzo finale." },
  { authorName: "Davide P.", rating: 4, text: "Buon lavoro, consigliato per piccole riparazioni urgenti." },
];

const NEW_PROFESSIONALS = [
  { businessName: "Rossi Impianti", categorySlug: "elettricista", categoryLabel: "Elettricista", city: "Latina", rating: 4.8, verified: true },
  { businessName: "Bianchi Idraulica", categorySlug: "idraulico", categoryLabel: "Idraulico", city: "Roma", rating: 4.6, verified: true },
  { businessName: "Verdi Pulizie", categorySlug: "pulizie", categoryLabel: "Pulizie", city: "Napoli", rating: 4.9, verified: false },
  { businessName: "Colombo Ristrutturazioni", categorySlug: "muratore", categoryLabel: "Muratore e ristrutturazioni", city: "Milano", rating: 4.7, verified: true },
];

export default function HomePage() {
  const router = useRouter();

  function handleSearch({ query, city }: { query: string; city: string }) {
    const category = findCategoryByQuery(query);
    const params = city.trim() ? `?citta=${encodeURIComponent(city.trim())}` : "";
    if (category) {
      router.push(`/cerca/${category.slug}${params}`);
    }
  }

  return (
    <YStack width="100%" alignItems="center">
      <Hero
        title="Trova il professionista giusto, vicino a te"
        subtitle="Idraulici, elettricisti, imbianchini e altri professionisti verificati. Richiedi un preventivo in pochi minuti."
        onSearch={handleSearch}
        onUrgentPress={() => router.push("/urgente")}
        onQuotePress={() => router.push("/preventivo")}
      />

      <YStack width="100%" maxWidth={1080} paddingVertical="$6" paddingHorizontal="$4" gap="$4" alignItems="center">
        <CategoryChips
          items={PROFESSIONAL_CATEGORIES.map((c) => ({ key: c.slug, label: `${c.icon} ${c.label}` }))}
          onPress={(slug) => router.push(`/cerca/${slug}`)}
        />
        <CategoryChips
          items={FEATURED_SUB_SERVICES.map((s) => ({ key: s.key, label: s.label }))}
          onPress={(key) => {
            const service = FEATURED_SUB_SERVICES.find((s) => s.key === key);
            if (service) router.push(`/cerca/${service.parentSlug}`);
          }}
        />
      </YStack>

      <YStack width="100%" backgroundColor="$color2" paddingVertical="$8" paddingHorizontal="$4" alignItems="center">
        <XStack flexWrap="wrap" justifyContent="center" gap="$6" maxWidth={1080}>
          <IconFeature
            icon="🔍"
            title="Trova un professionista nella tua città"
            description="Scegli tra decine di professionisti verificati e specializzati per categoria e zona."
          />
          <IconFeature
            icon="📷"
            title="Richiedi un preventivo: è facile e gratuito"
            description="Descrivi il lavoro, invia una foto e ricevi un preventivo. Nessun costo aggiuntivo per richiederlo."
          />
          <IconFeature
            icon="🧾"
            title="Ricevi un preventivo strutturato"
            description="Manodopera, materiali e tempistiche chiare prima di accettare, tutto dentro la piattaforma."
          />
          <IconFeature
            icon="🔔"
            title="Promemoria via email e SMS"
            description="Non perderai un appuntamento: te lo ricordiamo noi via email e SMS."
          />
        </XStack>
      </YStack>

      <YStack width="100%" maxWidth={1080} paddingVertical="$8" paddingHorizontal="$4">
        <XStack flexWrap="wrap" gap="$6" justifyContent="space-between">
          <YStack flex={1} minWidth={280} gap="$3">
            <H2 size="$7">Consigli dai professionisti</H2>
            {PROFESSIONAL_TIPS.map((tip) => (
              <TestimonialCard key={tip.authorName} {...tip} />
            ))}
          </YStack>
          <YStack flex={1} minWidth={280} gap="$3">
            <H2 size="$7">Ultime recensioni</H2>
            {CLIENT_REVIEWS.map((review) => (
              <TestimonialCard key={review.authorName} {...review} />
            ))}
          </YStack>
        </XStack>
      </YStack>

      <YStack width="100%" maxWidth={1080} paddingVertical="$8" paddingHorizontal="$4" gap="$4">
        <H2 size="$7">Nuovi professionisti su Professionisti</H2>
        <XStack gap="$3" overflow="scroll" paddingBottom="$2">
          {NEW_PROFESSIONALS.map((pro) => (
            <YStack key={pro.businessName} minWidth={220} gap="$2">
              <ProfessionalCard
                businessName={pro.businessName}
                categoryLabel={pro.categoryLabel}
                city={pro.city}
                rating={pro.rating}
                verified={pro.verified}
              />
            </YStack>
          ))}
        </XStack>
        <Text fontSize="$2" color="$color9">
          Profili di esempio — i primi professionisti reali arriveranno con il lancio della piattaforma.
        </Text>
      </YStack>

      <YStack width="100%" maxWidth={1080} paddingVertical="$8" paddingHorizontal="$4" gap="$5">
        <H2 size="$8">Sei un professionista? Inizia a crescere oggi</H2>
        <YStack width="100%" gap="$4" $gtSm={{ flexDirection: "row" }}>
          <YStack flex={1} backgroundColor="$blue2" borderRadius="$6" padding="$5" gap="$3">
            <Text fontSize="$9">📊</Text>
            <H2 size="$6">Gestionale per professionisti</H2>
            <Paragraph color="$color10">
              Agenda digitale, promemoria automatici e fatturazione: fatti trovare pronto ad ogni richiesta.
            </Paragraph>
            <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
              <Button>Scopri i piani</Button>
            </Link>
          </YStack>
          <YStack flex={1} backgroundColor="$color3" borderRadius="$6" padding="$5" gap="$3">
            <Text fontSize="$9">🤖</Text>
            <H2 size="$6">Richiesta Guidata con IA</H2>
            <Paragraph color="$color10">
              Il cliente descrive il lavoro con una foto: a te arrivano solo richieste già qualificate, con
              categoria e budget stimato.
            </Paragraph>
            <Link href="/preventivo" style={{ textDecoration: "none" }}>
              <Button backgroundColor="$color12" color="white">
                Scopri come funziona
              </Button>
            </Link>
          </YStack>
        </YStack>
      </YStack>
    </YStack>
  );
}
