"use client";

import { MAX_PROFESSIONAL_CATEGORIES, PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { CATEGORY_ACCENT, CategoryIcon } from "@/components/icons/CategoryIcons";

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
    <YStack gap="$3">
      <XStack alignItems="baseline" justifyContent="space-between" gap="$3">
        <Text fontSize="$2" color={brand.grafite70} flexShrink={1}>
          {isFull ? "Hai scelto il massimo: togline una per cambiarla." : `Fino a ${MAX_PROFESSIONAL_CATEGORIES}. La prima è la principale.`}
        </Text>
        <Text fontSize="$2" fontWeight="700" color={value.length ? brand.cianografiaScuro : brand.grafite70} flexShrink={0} aria-live="polite">
          {value.length} su {MAX_PROFESSIONAL_CATEGORIES}
        </Text>
      </XStack>

      <div className="cat-tiles">
        {PROFESSIONAL_CATEGORIES.map((category) => {
          const active = value.includes(category.slug);
          const isPrimary = value[0] === category.slug;
          const disabled = !active && isFull;
          const accent = CATEGORY_ACCENT[category.slug];
          return (
            <button
              key={category.slug}
              type="button"
              className={`cat-tile${active ? " is-on" : ""}`}
              onClick={() => toggle(category.slug)}
              aria-pressed={active}
              disabled={disabled}
              aria-label={isPrimary ? `${category.label}, principale` : category.label}
            >
              <span className="cat-tile-icon" style={{ background: accent.bg, color: accent.fg }} aria-hidden="true">
                <CategoryIcon slug={category.slug} size={26} />
              </span>
              <span className="cat-tile-label">{category.label}</span>
              {isPrimary ? <span className="cat-tile-primary">Principale</span> : null}
              {active ? (
                <span className="cat-tile-check" aria-hidden="true">
                  <Icon name="check" size={14} color="white" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

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
