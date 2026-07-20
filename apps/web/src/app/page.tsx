"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PROFESSIONAL_CATEGORIES, findCategoryByQuery } from "@professionisti/shared";
import { Hero, CategoryCard, IconFeature, Button, H2, Paragraph, XStack, YStack } from "@professionisti/ui";

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
      />

      <YStack width="100%" maxWidth={1080} paddingVertical="$8" paddingHorizontal="$4" gap="$5">
        <YStack gap="$1">
          <H2 size="$8">Le categorie più richieste</H2>
          <Paragraph color="$color10">Scegli un servizio per vedere i professionisti disponibili nella tua zona.</Paragraph>
        </YStack>
        <XStack flexWrap="wrap" gap="$3">
          {PROFESSIONAL_CATEGORIES.map((category) => (
            <Link key={category.slug} href={`/cerca/${category.slug}`} style={{ textDecoration: "none" }}>
              <CategoryCard icon={category.icon} label={category.label} />
            </Link>
          ))}
        </XStack>
      </YStack>

      <YStack width="100%" backgroundColor="$color2" paddingVertical="$8" paddingHorizontal="$4" alignItems="center">
        <XStack flexWrap="wrap" justifyContent="center" gap="$6" maxWidth={1080}>
          <IconFeature
            icon="✅"
            title="Professionisti verificati"
            description="Ogni profilo è controllato: niente elenchi anonimi, solo professionisti reali e contattabili."
          />
          <IconFeature
            icon="📋"
            title="Preventivo strutturato"
            description="Manodopera, materiali e tempistiche chiare prima di accettare un lavoro, tutto dentro la piattaforma."
          />
          <IconFeature
            icon="⭐"
            title="Recensioni vere"
            description="Solo da prenotazioni confermate: nessuna recensione falsa o comprata."
          />
        </XStack>
      </YStack>

      <YStack
        width="100%"
        paddingVertical="$8"
        paddingHorizontal="$4"
        alignItems="center"
        gap="$4"
        backgroundColor="$blue10"
      >
        <YStack maxWidth={560} alignItems="center" gap="$2">
          <H2 size="$8" color="white" textAlign="center">
            Sei un professionista?
          </H2>
          <Paragraph color="white" textAlign="center" opacity={0.9}>
            Iscriviti gratis, ricevi richieste di preventivo dalla tua zona e gestisci la tua agenda in un unico
            posto.
          </Paragraph>
        </YStack>
        <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
          <Button size="$5" backgroundColor="white" color="$blue10">
            Iscriviti gratis
          </Button>
        </Link>
      </YStack>
    </YStack>
  );
}
