"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { findComuneBySlug, isProfessionalCategorySlug, PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import { Icon, SearchBar, Text, YStack, brand, type ProfessionalSuggestion, type SearchMode } from "@professionisti/ui";
import { buildSearchDestination } from "@/lib/searchNavigation";
import { rememberSearchCity, useSearchBarHints } from "@/lib/useSearchBarHints";
import { navigateWithTransition } from "@/lib/viewTransition";
import { MagneticButton } from "./MagneticButton";

type UnknownSearch = { title: string; hint: string; query: string; city: string };

/** Testo scritto nell'indirizzo, leggibile: "san-marco" diventa "san marco". */
function readable(slug: string): string {
  try {
    return decodeURIComponent(slug).replace(/-/g, " ").trim();
  } catch {
    return slug;
  }
}

/**
 * Cosa non va in un indirizzo di ricerca: una città o un servizio che non
 * conosciamo. `null` per tutto il resto (la pagina resta quella generica).
 */
export function describeUnknownSearch(pathname: string): UnknownSearch | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "cerca" || !parts[1]) return null;
  const [, categorySlug, citySlug] = parts;
  const category = isProfessionalCategorySlug(categorySlug) ? PROFESSIONAL_CATEGORIES.find((item) => item.slug === categorySlug) : undefined;
  if (!category) {
    const city = citySlug ? (findComuneBySlug(citySlug)?.name ?? readable(citySlug)) : "";
    return {
      title: `Non conosciamo il servizio «${readable(categorySlug)}»`,
      hint: "Controlla il nome o scegline uno dall'elenco.",
      query: readable(categorySlug),
      city,
    };
  }
  if (citySlug && !findComuneBySlug(citySlug)) {
    return {
      title: `Non conosciamo la città «${readable(citySlug)}»`,
      hint: "Controlla il nome o scegline una dall'elenco.",
      query: category.label,
      city: readable(citySlug),
    };
  }
  return null;
}

/**
 * Ricerca con una città o un servizio sconosciuti (docs/CHANGELOG.md §349):
 * la pagina resta un 404 per Google, ma dice cosa non va e ha già la ricerca
 * compilata da correggere. Caricata a parte da NotFoundContent: porta con sé
 * l'elenco dei comuni, che non deve finire nella pagina "non trovata" generica.
 */
export function UnknownSearchNotice({ pathname, fallback }: { pathname: string; fallback: ReactNode }) {
  const router = useRouter();
  const unknown = describeUnknownSearch(pathname);
  const searchHints = useSearchBarHints(unknown?.query ?? "");
  if (!unknown) return <>{fallback}</>;

  async function handleSearch(params: { query: string; city: string; professional?: ProfessionalSuggestion; mode: SearchMode }) {
    rememberSearchCity(params.city);
    const destination = await buildSearchDestination(params);
    navigateWithTransition(() => router.push(destination));
  }

  return (
    <YStack width="100%" gap="$4" alignItems="center">
      <YStack width={64} height={64} borderRadius={32} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center">
        <Icon name="search" size={28} color={brand.cianografiaScuro} strokeWidth={1.75} />
      </YStack>
      <YStack gap="$2" alignItems="center">
        <Text tag="h1" margin={0} fontFamily="$heading" fontWeight="800" fontSize="$9" color={brand.grafite} textAlign="center" style={{ textWrap: "balance" }}>
          {unknown.title}
        </Text>
        <Text fontSize="$4" lineHeight={26} color={brand.grafite70} textAlign="center">
          {unknown.hint}
        </Text>
      </YStack>
      <YStack width="100%">
        <SearchBar
          wrapSearchButton={(button) => <MagneticButton block>{button}</MagneticButton>}
          onSearch={handleSearch}
          initialQuery={unknown.query}
          initialCity={unknown.city}
          {...searchHints}
        />
      </YStack>
    </YStack>
  );
}
