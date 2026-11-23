"use client";

import { CATEGORY_COMPANIONS, COMBINED_TRADES, MAX_PROFESSIONAL_CATEGORIES, PROFESSIONAL_CATEGORIES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { CategoryTiles } from "@/components/CategoryTiles";
import { keyActivate } from "@/lib/keyActivate";

/**
 * Scelta delle categorie del professionista, da 1 a 3 (docs/CHANGELOG.md
 * §217): usata in registrazione, in /dashboard/profilo e dall'operatore in
 * /admin/professionisti. La prima scelta è la principale, e con più di una
 * si sceglie l'ordine con cui compaiono sul profilo. Raggiunto il massimo, le altre non si possono
 * toccare finché non se ne toglie una.
 *
 * Pillole con l'icona colorata della categoria (dal 15/11/2026,
 * docs/changelog/2026-11-15-scelta-categoria-suggerita.md; prima tessere di
 * docs/CHANGELOG.md §279): spunta sulle scelte, "Principale" nella pillola
 * della prima, "N su 3" in alto.
 * Pillole in `CategoryTiles`, con prima i lavori che hanno più professionisti
 * iscritti (richiesta di Luca, docs/changelog/2026-11-02-categorie-telefono.md;
 * prima i più cercati).
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
  // Il primo mestiere scelto con un vicino ancora da aggiungere, se c'è posto.
  const companion = isFull
    ? undefined
    : value.map((slug) => CATEGORY_COMPANIONS[slug]).find((entry) => entry !== undefined && !value.includes(entry.suggest));
  const companionLabel = companion ? PROFESSIONAL_CATEGORIES.find((category) => category.slug === companion.suggest)?.label : undefined;
  // Mestiere fatto di due categorie, finché non sono scelte tutte e due e c'è
  // posto; sparisce quando compare il riquadro del mestiere vicino.
  const combined = companion
    ? undefined
    : COMBINED_TRADES.map((trade) => ({ ...trade, missing: trade.categories.filter((slug) => !value.includes(slug)) })).find(
        (trade) => trade.missing.length > 0 && value.length + trade.missing.length <= MAX_PROFESSIONAL_CATEGORIES,
      );
  const labelOf = (slug: ProfessionalCategorySlug) => PROFESSIONAL_CATEGORIES.find((category) => category.slug === slug)?.label ?? slug;

  function toggle(slug: ProfessionalCategorySlug) {
    if (value.includes(slug)) {
      onChange(value.filter((item) => item !== slug));
    } else if (!isFull) {
      onChange([...value, slug]);
    }
  }

  return (
    <YStack gap="3">
      <XStack alignItems="baseline" justifyContent="space-between" gap="3">
        <Text fontSize={13} color={brand.grafite70} flexShrink={1}>
          {isFull ? "Hai scelto il massimo: togline una per cambiarla." : `Fino a ${MAX_PROFESSIONAL_CATEGORIES}. La prima è la principale.`}
        </Text>
        <Text fontSize={13} fontWeight="700" color={value.length ? brand.cianografiaScuro : brand.grafite70} flexShrink={0} aria-live="polite">
          {value.length} su {MAX_PROFESSIONAL_CATEGORIES}
        </Text>
      </XStack>

      {combined ? (
        // docs/changelog/2026-11-23-termoidraulico.md
        <XStack alignItems="center" gap="2" flexWrap="wrap">
          <Text fontSize={13} color={brand.grafite70} flexShrink={1}>
            {combined.question} Scegli {combined.categories.map((slug) => `«${labelOf(slug)}»`).join(" e ")}.
          </Text>
          <Text
            fontSize={13}
            fontWeight="700"
            color={brand.cianografiaScuro}
            textDecorationLine="underline"
            cursor="pointer"
            role="button"
            onPress={() => onChange([...value, ...combined.missing])}
            onKeyDown={keyActivate(() => onChange([...value, ...combined.missing]))}
          >
            {combined.missing.length === combined.categories.length ? "Scegli tutti e due" : `Aggiungi «${labelOf(combined.missing[0]!)}»`}
          </Text>
        </XStack>
      ) : null}

      <CategoryTiles
        value={value}
        onToggle={toggle}
        max={MAX_PROFESSIONAL_CATEGORIES}
        city={city}
        showPrimary
        ariaLabel="Che lavori fai?"
        orderBy="professionals"
      />

      {companion && companionLabel ? (
        // Mestiere vicino da aggiungere (docs/changelog/2026-11-04-avviso-caldaie.md).
        <XStack
          alignItems="center"
          gap="3"
          flexWrap="wrap"
          padding="3"
          borderRadius={10}
          borderWidth={1}
          borderColor={brand.bordoCampo}
          backgroundColor={brand.cianografiaVelo}
          aria-live="polite"
        >
          <YStack flex={1} minWidth={200} gap="1">
            <Text fontSize={14} fontWeight="700" color={brand.grafite}>
              {companion.question}
            </Text>
            <Text fontSize={13} color={brand.grafite70}>
              Aggiungi anche «{companionLabel}»: {companion.reason}
            </Text>
          </YStack>
          <Button variant="secondary" size="3" icon={<Icon name="plus" size={16} color={brand.cianografiaScuro} />} onPress={() => onChange([...value, companion.suggest])}>
            Aggiungi
          </Button>
        </XStack>
      ) : null}

      {value.length > 1 ? (
        // Ordine dei mestieri sul profilo pubblico: il primo è la principale
        // (docs/changelog/2026-11-05-registrazione-colonna-unica.md, prima
        // solo "Cambia la principale").
        <YStack gap="2">
          <Text fontSize={13} fontWeight="700" color={brand.grafite}>
            Ordine sul tuo profilo
          </Text>
          <YStack gap="2" role="list" aria-label="Ordine dei lavori sul tuo profilo">
            {value.map((slug, index) => {
              const category = PROFESSIONAL_CATEGORIES.find((item) => item.slug === slug);
              if (!category) return null;
              const isPrimary = index === 0;
              return (
                <XStack
                  key={slug}
                  role="listitem"
                  alignItems="center"
                  gap="2"
                  minHeight={44}
                  paddingLeft="3"
                  paddingRight="1"
                  borderRadius={10}
                  borderWidth={1}
                  borderColor={isPrimary ? brand.ottone : brand.bordoCampo}
                  backgroundColor={isPrimary ? brand.ottoneVelo : brand.calce}
                >
                  <Text fontSize={13} fontWeight="700" color={brand.grafite70} width={16}>
                    {index + 1}
                  </Text>
                  <Text fontSize={14} fontWeight="600" color={brand.grafite} flex={1}>
                    {category.label}
                  </Text>
                  {isPrimary ? (
                    <XStack alignItems="center" gap="1">
                      <Icon name="star" size={13} color={brand.ottoneScuro} />
                      <Text fontSize={12} fontWeight="700" color={brand.ottoneScuro}>
                        Principale
                      </Text>
                    </XStack>
                  ) : null}
                  <XStack>
                    <OrderButton label={`Sposta ${category.label} su`} icon="chevron-up" disabled={index === 0} onPress={() => onChange(moved(value, index, -1))} />
                    <OrderButton
                      label={`Sposta ${category.label} giù`}
                      icon="chevron-down"
                      disabled={index === value.length - 1}
                      onPress={() => onChange(moved(value, index, 1))}
                    />
                  </XStack>
                </XStack>
              );
            })}
          </YStack>
        </YStack>
      ) : null}
    </YStack>
  );
}

function moved(list: ProfessionalCategorySlug[], index: number, step: -1 | 1): ProfessionalCategorySlug[] {
  const target = index + step;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

function OrderButton({ label, icon, disabled, onPress }: { label: string; icon: "chevron-up" | "chevron-down"; disabled: boolean; onPress: () => void }) {
  return (
    <XStack
      width={40}
      height={40}
      alignItems="center"
      justifyContent="center"
      borderRadius={999}
      cursor={disabled ? "default" : "pointer"}
      opacity={disabled ? 0.3 : 1}
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      onPress={disabled ? undefined : onPress}
      onKeyDown={keyActivate(disabled ? undefined : onPress)}
    >
      <Icon name={icon} size={18} color={brand.grafite} />
    </XStack>
  );
}
