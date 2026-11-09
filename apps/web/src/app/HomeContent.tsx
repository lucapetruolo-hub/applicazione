"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import type { PopularJobsResponse, ProblemExamplesResponse, ProfessionalCategorySlug, ServicePriceIndexEntry } from "@professionisti/shared";
import type { NewProfileSummary } from "@/lib/newProfiles";
import { Section, SectionDensityProvider, YStack } from "@professionisti/ui";
import { CategoryStoryRail, useCategoryStoryRail } from "@/components/CategoryStoryRail";
import { FadeInSection } from "@/components/FadeInSection";
import { HomeFaq } from "@/components/HomeFaq";
import { HomeHero } from "@/components/HomeHero";
import { NewProfilesCarousel } from "@/components/NewProfilesCarousel";
import { PopularJobs } from "@/components/PopularJobs";
import { PlatformStats } from "@/components/PlatformStats";
import { PriceEstimatorTool } from "@/components/PriceEstimatorTool";
import { QualitySection } from "@/components/QualitySection";
import { QuoteExampleSection } from "@/components/QuoteExampleSection";
import { RecentReviews } from "@/components/RecentReviews";
import { ProCtaSection } from "@/components/ProCtaSection";

export default function HomeContent({
  professionals,
  platformStats,
  priceIndex,
  categoryCounts,
  problemExamples,
  popularJobs,
}: {
  /** "Lavori più cercati" già in ordine; `null` se l'API non ha risposto (resta l'elenco di partenza). */
  popularJobs: PopularJobsResponse | null;
  professionals: NewProfileSummary[];
  /** Frasi d'esempio della ricerca per problema, nell'ordine delle ricerche; `null` se l'API non ha risposto. */
  problemExamples: ProblemExamplesResponse | null;
  /** Professionisti per categoria, vicino all'ultima città cercata o in tutta Italia (app/page.tsx). */
  categoryCounts: Partial<Record<ProfessionalCategorySlug, number>>;
  /** "Quanto costa in media" già dal server; `null` se l'API non ha risposto. */
  priceIndex: ServicePriceIndexEntry[] | null;
  platformStats: { totalUsers: number; totalProfessionals: number; reviewCount?: number; averageRating?: number | null } | null;
}) {
  // L'ordine di "Di cosa hai bisogno?": prima le categorie con più professionisti.
  const categoryRail = useCategoryStoryRail(categoryCounts);
  // Finché non ci sono recensioni la sezione mostra solo i profili nuovi:
  // il titolo dice "Nuovi professionisti", non "Cosa dicono i clienti"
  // (docs/changelog/2026-11-08-trasparenza-chiara-prezzi-in-arrivo.md).
  const [reviewCount, setReviewCount] = useState<number | null>(null);
  const hasReviews = reviewCount !== null && reviewCount > 0;

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
        <HomeHero examples={problemExamples} />

        {platformStats ? (
          <Suspense fallback={null}>
            <PlatformStats stats={platformStats} />
          </Suspense>
        ) : null}

        {/* 2. Categorie. */}
        <FadeInSection>
          <Section title="Di cosa hai bisogno?" maxWidth={1080}>
            <CategoryStoryRail state={categoryRail} />
            <PopularJobs data={popularJobs} />
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
            <Section
              title={hasReviews ? "Cosa dicono i clienti" : "Nuovi professionisti"}
              titleAction={
                <Link href="/cerca" className="home-section-action">
                  Vedi tutti
                </Link>
              }
              maxWidth={1080}
            >
              <RecentReviews
                summary={
                  platformStats?.reviewCount !== undefined && platformStats.averageRating != null
                    ? { count: platformStats.reviewCount, average: platformStats.averageRating }
                    : null
                }
                onCount={setReviewCount}
              />
              <NewProfilesCarousel professionals={professionals} showTitle={hasReviews} />
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
          {/* Ancora per "Quanto costa" nella barra in alto (§398). */}
          <div id="quanto-costa" style={{ width: "100%", scrollMarginTop: 72 }}>
            <PriceEstimatorTool initialEntries={priceIndex}>
              <HomeFaq />
            </PriceEstimatorTool>
          </div>
        </FadeInSection>

        {/* 7. Per chi offre servizi. */}
        <Suspense fallback={null}>
          <ProCtaSection />
        </Suspense>
      </YStack>
    </SectionDensityProvider>
  );
}
