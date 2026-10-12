"use client";

import { MAX_PROFESSIONAL_CATEGORIES, PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

/**
 * Scelta delle categorie del professionista, da 1 a 3 (docs/CHANGELOG.md
 * §217): usata in registrazione e in /dashboard/profilo. La prima scelta è
 * la principale, e con più di una si può cambiare quale. Raggiunto il
 * massimo, le altre non si possono toccare finché non se ne toglie una.
 */
export function CategoryMultiPicker({
  value,
  onChange,
}: {
  value: ProfessionalCategorySlug[];
  onChange: (next: ProfessionalCategorySlug[]) => void;
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
    <YStack gap="$2">
      <YStack flexDirection="row" flexWrap="wrap" gap="$2">
        {PROFESSIONAL_CATEGORIES.map((category) => {
          const active = value.includes(category.slug);
          const disabled = !active && isFull;
          return (
            <XStack
              key={category.slug}
              alignItems="center"
              gap="$2"
              paddingHorizontal="$3"
              paddingVertical="$2"
              borderRadius="$2"
              borderWidth={1}
              borderColor={active ? brand.cianografia : brand.filetto}
              backgroundColor={active ? brand.cianografiaVelo : brand.calce}
              opacity={disabled ? 0.45 : 1}
              cursor={disabled ? "not-allowed" : "pointer"}
              onPress={() => toggle(category.slug)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active, disabled }}
            >
              <Icon name={active ? "check" : category.icon} size={15} color={active ? brand.cianografiaScuro : brand.grafite} />
              <Text color={active ? brand.cianografiaScuro : brand.grafite} fontWeight="600">
                {category.label}
              </Text>
            </XStack>
          );
        })}
      </YStack>
      <Text fontSize="$2" color={brand.grafite70}>
        {isFull
          ? `Hai scelto ${MAX_PROFESSIONAL_CATEGORIES} categorie, il massimo: togline una per sceglierne un'altra.`
          : `Scegline fino a ${MAX_PROFESSIONAL_CATEGORIES} (${value.length} su ${MAX_PROFESSIONAL_CATEGORIES}).`}
      </Text>
      {value.length > 1 ? (
        <XStack alignItems="center" gap="$2" flexWrap="wrap">
          <Text fontSize="$2" fontWeight="700" color={brand.grafite}>
            Principale:
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
                paddingHorizontal="$2"
                paddingVertical={4}
                borderRadius="$2"
                borderWidth={1}
                borderColor={isPrimary ? brand.cianografia : brand.filetto}
                backgroundColor={isPrimary ? brand.cianografia : brand.calce}
                cursor={isPrimary ? "default" : "pointer"}
                onPress={isPrimary ? undefined : () => onChange([slug, ...value.filter((item) => item !== slug)])}
                accessibilityRole="radio"
                accessibilityState={{ checked: isPrimary }}
              >
                <Text fontSize="$2" fontWeight="600" color={isPrimary ? "white" : brand.grafite}>
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
