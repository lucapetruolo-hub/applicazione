"use client";

import type { ProfessionalSearchResult } from "@professionisti/shared";
import { Section, SectionDensityProvider, YStack } from "@professionisti/ui";
import { CategoryStoryRail } from "@/components/CategoryStoryRail";
import { FadeInSection } from "@/components/FadeInSection";
import { HomeFaq } from "@/components/HomeFaq";
import { HomeHero } from "@/components/HomeHero";
import { NewProfilesCarousel } from "@/components/NewProfilesCarousel";
import { PlatformGuarantee } from "@/components/PlatformGuarantee";
import { PlatformStats } from "@/components/PlatformStats";
import { PriceEstimatorTool } from "@/components/PriceEstimatorTool";
import { QualitySection } from "@/components/QualitySection";
import { QuoteExampleSection } from "@/components/QuoteExampleSection";
import { RecentReviews } from "@/components/RecentReviews";
import { ProfessionalsShowcase } from "@/components/ProfessionalsShowcase";
import { ProCtaSection } from "@/components/ProCtaSection";

export default function HomeContent({
  professionals,
  platformStats,
}: {
  professionals: ProfessionalSearchResult[];
  platformStats: { totalUsers: number; totalProfessionals: number; reviewCount?: number; averageRating?: number | null } | null;
}) {
  // Conteggio reale per categoria (professionals arriva già filtrato
  // excludeDemo da apps/web/src/app/page.tsx): la riga "N professionisti"
  // sotto ogni categoria è omessa quando il conteggio è 0, mai un numero
  // finto (brief redesign §4.3).
  const countBySlug = new Map<string, number>();
  // Conta tutte le categorie del professionista (fino a 3, §217), non solo
  // la principale: chi fa anche il dogsitter rende "Disponibile" anche quella.
  for (const pro of professionals) {
    for (const { slug } of pro.categories) {
      countBySlug.set(slug, (countBySlug.get(slug) ?? 0) + 1);
    }
  }

  return (
    // Spazi tra le sezioni più stretti che nel resto del sito: la home ha
    // molte sezioni in fila (docs/CHANGELOG.md §219).
    <SectionDensityProvider value="compact">
      {/* Sette blocchi invece di dodici (scelta dell'utente, idea presa dal
          sito Volt, docs/CHANGELOG.md §219): le sezioni che parlavano della
          stessa cosa sono unite. Una `Section` dentro un'altra diventa una
          sottosezione (packages/ui/src/Section.tsx). Il link "Hai
          un'emergenza?" in fondo è stato tolto: la richiesta urgente è già
          nella parte verde in alto. */}
      <YStack width="100%" alignItems="center">
        {/* 1. Parte verde con la ricerca, invariata. */}
        <HomeHero />

        {platformStats ? <PlatformStats stats={platformStats} /> : null}

        {/* 2. Categorie. */}
        <FadeInSection>
          <Section
            eyebrow="Categorie"
            title="Di cosa hai bisogno?"
            titleAccent="bisogno"
            maxWidth={1080}
          >
            <CategoryStoryRail countBySlug={countBySlug} />
          </Section>
        </FadeInSection>

        {/* 3. Come funziona, con un preventivo d'esempio. */}
        <FadeInSection>
          <div id="come-funziona" style={{ width: "100%", scrollMarginTop: 72 }}>
            <QuoteExampleSection />
          </div>
        </FadeInSection>

        {/* 4. Professionisti e recensioni (o "Arriviamo presto" quando i
            profili sono ancora pochi). */}
        <FadeInSection>
          <Section
            eyebrow="Professionisti"
            title="Professionisti della tua zona"
            titleAccent="della tua zona"
            maxWidth={1080}
          >
            <RecentReviews
              summary={
                platformStats?.reviewCount !== undefined && platformStats.averageRating != null
                  ? { count: platformStats.reviewCount, average: platformStats.averageRating }
                  : null
              }
            />
            <NewProfilesCarousel professionals={professionals} />
            <ProfessionalsShowcase professionals={professionals} />
          </Section>
        </FadeInSection>

        {/* 5. Perché fidarsi: trasparenza e Garanzia Piattaforma. */}
        <FadeInSection>
          <QualitySection>
            <PlatformGuarantee />
          </QualitySection>
        </FadeInSection>

        {/* 6. Prezzi e domande frequenti. */}
        <FadeInSection>
          <PriceEstimatorTool>
            <HomeFaq />
          </PriceEstimatorTool>
        </FadeInSection>

        {/* 7. Per chi offre servizi. */}
        <ProCtaSection />
      </YStack>
    </SectionDensityProvider>
  );
}
