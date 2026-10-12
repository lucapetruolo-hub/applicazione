"use client";

import Link from "next/link";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import {
  Icon,
  Section,
  SectionDensityProvider,
  Text,
  XStack,
  YStack,
  brand,
} from "@professionisti/ui";
import { CategoryStoryRail } from "@/components/CategoryStoryRail";
import { FadeInSection } from "@/components/FadeInSection";
import { HomeFaq } from "@/components/HomeFaq";
import { HomeHero } from "@/components/HomeHero";
import { HowItWorks } from "@/components/HowItWorks";
import { NewProfilesCarousel } from "@/components/NewProfilesCarousel";
import { PlatformGuarantee } from "@/components/PlatformGuarantee";
import { PlatformStats } from "@/components/PlatformStats";
import { PriceEstimatorTool } from "@/components/PriceEstimatorTool";
import { QualitySection } from "@/components/QualitySection";
import { RecentReviews } from "@/components/RecentReviews";
import { ProfessionalsShowcase } from "@/components/ProfessionalsShowcase";
import { ProCtaSection } from "@/components/ProCtaSection";

export default function HomeContent({
  professionals,
  platformStats,
}: {
  professionals: ProfessionalSearchResult[];
  platformStats: { totalUsers: number; totalProfessionals: number } | null;
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
    // Ritmo stretto tra le sezioni: con quello pieno (96px sopra e sotto)
    // la home aveva grandi spazi vuoti (docs/CHANGELOG.md §219).
    <SectionDensityProvider value="compact">
      <YStack width="100%" alignItems="center">
        <HomeHero />

        {platformStats ? <PlatformStats stats={platformStats} /> : null}

        <FadeInSection>
          <Section
            eyebrow="Categorie"
            title="Di cosa hai bisogno?"
            maxWidth={1080}
          >
            <CategoryStoryRail countBySlug={countBySlug} />
          </Section>
        </FadeInSection>

        {/* "Recensioni verificate" e "Nuovi profili" spostati subito sotto le
          categorie (richiesta esplicita dell'utente) — prima erano più in
          basso, dopo "Come funziona". */}
        <FadeInSection>
          <RecentReviews />
        </FadeInSection>

        <FadeInSection>
          <NewProfilesCarousel professionals={professionals} />
        </FadeInSection>

        <FadeInSection>
          <QualitySection />
        </FadeInSection>

        <FadeInSection>
          <PlatformGuarantee />
        </FadeInSection>

        {/* "Cosa succede se..." non è più mostrato direttamente in home
          (richiesta esplicita dell'utente): spostato in una pagina FAQ
          dedicata (/faq, WhatIfSection montata lì), raggiungibile dal
          link "Domande frequenti" nel footer, colonna "Per i clienti". */}

        <FadeInSection>
          <PriceEstimatorTool />
        </FadeInSection>

        <FadeInSection>
          <div id="come-funziona" style={{ width: "100%" }}>
            <HowItWorks />
          </div>
        </FadeInSection>

        <FadeInSection>
          <HomeFaq />
        </FadeInSection>

        <FadeInSection>
          <ProfessionalsShowcase professionals={professionals} />
        </FadeInSection>

        <ProCtaSection />

        {/* Link diretto alla richiesta urgente: non un secondo CTA primario in
          hero (il brief vuole un solo CTA per schermata), ma resta
          raggiungibile per chi arriva fin qui senza averla notata. */}
        <FadeInSection>
          <YStack
            width="100%"
            maxWidth={1080}
            paddingVertical="$6"
            paddingHorizontal="$4"
            alignItems="center"
          >
            <Link href="/urgente" style={{ textDecoration: "none" }}>
              <XStack alignItems="center" gap="$2">
                <Icon name="zap" size={16} color={brand.urgenza} />
                <Text color={brand.urgenza} fontWeight="600">
                  Hai un'emergenza? Richiedi un intervento urgente
                </Text>
              </XStack>
            </Link>
          </YStack>
        </FadeInSection>
      </YStack>
    </SectionDensityProvider>
  );
}
