"use client";

import { MAX_PROFESSIONAL_CATEGORIES, PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { CategoryTiles } from "@/components/CategoryTiles";

/**
 * Scelta delle categorie del professionista, da 1 a 3 (docs/CHANGELOG.md
 * §217): usata in registrazione, in /dashboard/profilo e dall'operatore in
 * /admin/professionisti. La prima scelta è la principale, e con più di una
 * si può cambiare quale. Raggiunto il massimo, le altre non si possono
 * toccare finché non se ne toglie una.
 *
 * Tessere con l'icona colorata della categoria, le stesse della home
 * (docs/CHANGELOG.md §273, stile A scelto dall'utente al posto delle
 * etichette con il bordo dorato animato di §248): spunta verde sulle
 * scelte, "Principale" sotto il nome della prima, "N su 3" in alto.
 * Tessere in `CategoryTiles`, con i lavori più cercati prima.
 */
export function CategoryMultiPicker({
  value,
  onChange,
  city,
}: {
  value: ProfessionalCategorySlug[];
  onChange: (next: ProfessionalCategorySlug[]) => void;
  /** Città del profilo, per mettere prima i lavori più cercati lì. */
  city?: string;
}) {
  const isFull = value.length >= MAX_PROFESSIONAL_CATEGORIES;

  function toggle(slug: ProfessionalCategorySlug) {
    if (value.includes(slug)) {
      onChange(value.filter((item) => item !== slug));
    } else if (!isFull) {
      onChange([...value, slug]);
    }
  }

  return (
    <YStack gap="$3">
      <XStack alignItems="baseline" justifyContent="space-between" gap="$3">
        <Text fontSize="$2" color={brand.grafite70} flexShrink={1}>
          {isFull ? "Hai scelto il massimo: togline una per cambiarla." : `Fino a ${MAX_PROFESSIONAL_CATEGORIES}. La prima è la principale.`}
        </Text>
        <Text fontSize="$2" fontWeight="700" color={value.length ? brand.cianografiaScuro : brand.grafite70} flexShrink={0} aria-live="polite">
          {value.length} su {MAX_PROFESSIONAL_CATEGORIES}
        </Text>
      </XStack>

      <CategoryTiles value={value} onToggle={toggle} max={MAX_PROFESSIONAL_CATEGORIES} city={city} showPrimary ariaLabel="Che lavori fai?" />

      {value.length > 1 ? (
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <Text fontSize="$2" fontWeight="700" color={brand.grafite}>
            Cambia la principale:
          </Text>
          {value.map((slug, index) => {
            const category = PROFESSIONAL_CATEGORIES.find((item) => item.slug === slug);
            if (!category) return null;
            const isPrimary = index === 0;
            return (
              <XStack
                key={slug}
                alignItems="center"
                gap="$1"
                minHeight={36}
                paddingHorizontal="$3"
                borderRadius={999}
                borderWidth={1}
                borderColor={isPrimary ? brand.ottone : brand.bordoCampo}
                backgroundColor={isPrimary ? brand.ottoneVelo : brand.calce}
                cursor={isPrimary ? "default" : "pointer"}
                onPress={isPrimary ? undefined : () => onChange([slug, ...value.filter((item) => item !== slug)])}
                accessibilityRole="radio"
                accessibilityState={{ checked: isPrimary }}
              >
                {isPrimary ? <Icon name="star" size={13} color={brand.ottoneScuro} /> : null}
                <Text fontSize="$2" fontWeight="600" color={isPrimary ? brand.ottoneScuro : brand.grafite}>
                  {category.label}
                </Text>
              </XStack>
            );
          })}
        </XStack>
      ) : null}
    </YStack>
  );
}
