"use client";

import type { ProfessionalSearchResult } from "@professionisti/shared";
import { Section, SectionDensityProvider, YStack } from "@professionisti/ui";
import { CategoryShowAllButton, CategoryStoryRail, useCategoryStoryRail } from "@/components/CategoryStoryRail";
import { FadeInSection } from "@/components/FadeInSection";
import { HomeFaq } from "@/components/HomeFaq";
import { HomeHero } from "@/components/HomeHero";
import { NewProfilesCarousel } from "@/components/NewProfilesCarousel";
import { PlatformStats } from "@/components/PlatformStats";
import { PriceEstimatorTool } from "@/components/PriceEstimatorTool";
import { QualitySection } from "@/components/QualitySection";
import { QuoteExampleSection } from "@/components/QuoteExampleSection";
import { RecentReviews } from "@/components/RecentReviews";
import { ProCtaSection } from "@/components/ProCtaSection";

export default function HomeContent({
  professionals,
  platformStats,
}: {
  professionals: ProfessionalSearchResult[];
  platformStats: { totalUsers: number; totalProfessionals: number; reviewCount?: number; averageRating?: number | null } | null;
}) {
  const categoryRail = useCategoryStoryRail();

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
            title="Di cosa hai bisogno?"
            titleAction={<CategoryShowAllButton state={categoryRail} />}
            maxWidth={1080}
          >
            <CategoryStoryRail state={categoryRail} />
          </Section>
        </FadeInSection>

        {/* 3. Come funziona, con un preventivo d'esempio. */}
        <FadeInSection>
          <div id="come-funziona" style={{ width: "100%", scrollMarginTop: 72 }}>
            <QuoteExampleSection />
          </div>
        </FadeInSection>

        {/* 4. Professionisti e recensioni. Tolta la lista d'attesa "Arriviamo
            presto nella tua zona" (decisione di Luca, docs/CHANGELOG.md §271):
            chi non trova nessuno manda lo stesso la richiesta e viene avvisato
            quando arriva un professionista compatibile. Senza profili la
            sezione non compare, invece di restare un titolo vuoto. */}
        {professionals.length > 0 ? (
          <FadeInSection>
            {/* "Cosa dicono i clienti" (docs/CHANGELOG.md §349): il titolo
                diceva professionisti e il contenuto erano recensioni. */}
            <Section title="Cosa dicono i clienti" maxWidth={1080}>
              <RecentReviews
                summary={
                  platformStats?.reviewCount !== undefined && platformStats.averageRating != null
                    ? { count: platformStats.reviewCount, average: platformStats.averageRating }
                    : null
                }
              />
              <NewProfilesCarousel professionals={professionals} />
            </Section>
          </FadeInSection>
        ) : null}

        {/* 5. Perché fidarsi: un solo blocco (docs/CHANGELOG.md §349), prima
            tre tessere più una scheda "Come ti proteggiamo" sullo stesso tema. */}
        <FadeInSection>
          <QualitySection />
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
