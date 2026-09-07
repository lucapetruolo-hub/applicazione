"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PROFESSIONAL_CATEGORIES, type ProfessionalSearchResult } from "@professionisti/shared";
import { Icon, Section, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { CategoryCarousel } from "@/components/CategoryCarousel";
import { CategoryTile } from "@/components/CategoryTile";
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
import { WhatIfSection } from "@/components/WhatIfSection";
import { WhyWeExist } from "@/components/WhyWeExist";

export default function HomeContent({
  professionals,
  platformStats,
}: {
  professionals: ProfessionalSearchResult[];
  platformStats: { totalUsers: number; totalProfessionals: number } | null;
}) {
  const router = useRouter();

  // Conteggio reale per categoria (professionals arriva già filtrato
  // excludeDemo da apps/web/src/app/page.tsx): la riga "N professionisti"
  // sotto ogni categoria è omessa quando il conteggio è 0, mai un numero
  // finto (brief redesign §4.3).
  const countBySlug = new Map<string, number>();
  for (const pro of professionals) {
    countBySlug.set(pro.categorySlug, (countBySlug.get(pro.categorySlug) ?? 0) + 1);
  }

  return (
    <YStack width="100%" alignItems="center">
      <HomeHero />

      {platformStats ? <PlatformStats stats={platformStats} /> : null}

      <FadeInSection>
        <Section eyebrow="Categorie" title="Di cosa hai bisogno?" maxWidth={1080}>
          <CategoryCarousel>
            {PROFESSIONAL_CATEGORIES.map((c) => (
              <div key={c.slug} style={{ flexShrink: 0, scrollSnapAlign: "start" }}>
                <CategoryTile slug={c.slug} label={c.label} count={countBySlug.get(c.slug)} onPress={() => router.push(`/cerca/${c.slug}`)} />
              </div>
            ))}
            <div style={{ flexShrink: 0, scrollSnapAlign: "start" }}>
              <Surface
                width={152}
                minHeight={132}
                alignItems="center"
                justifyContent="center"
                gap="$2"
                cursor="pointer"
                onPress={() => router.push("/preventivo")}
                accessibilityRole="button"
                backgroundColor={brand.gesso}
              >
                <Icon name="sparkles" size={22} color={brand.cianografia} strokeWidth={1.5} />
                <Text fontWeight="600" color={brand.cianografia} textAlign="center">
                  Altro servizio →
                </Text>
              </Surface>
            </div>
          </CategoryCarousel>
        </Section>
      </FadeInSection>

      <FadeInSection>
        <QualitySection />
      </FadeInSection>

      <FadeInSection>
        <PlatformGuarantee />
      </FadeInSection>

      <FadeInSection>
        <WhatIfSection />
      </FadeInSection>

      <FadeInSection>
        <PriceEstimatorTool />
      </FadeInSection>

      <FadeInSection>
        <div id="come-funziona" style={{ width: "100%" }}>
          <HowItWorks />
        </div>
      </FadeInSection>

      <FadeInSection>
        <WhyWeExist />
      </FadeInSection>

      <FadeInSection>
        <RecentReviews />
      </FadeInSection>

      <FadeInSection>
        <NewProfilesCarousel professionals={professionals} />
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
        <YStack width="100%" maxWidth={1080} paddingVertical="$6" paddingHorizontal="$4" alignItems="center">
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
  );
}
