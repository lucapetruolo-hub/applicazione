"use client";

import { installerQualificationsFor, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { keyActivate } from "@/lib/keyActivate";

/**
 * Abilitazioni DM 37/2008 nel profilo del professionista
 * (docs/changelog/2026-11-23-termoidraulico.md): una casella per lettera,
 * solo quelle dei mestieri scelti (il termoidraulico vede acqua, gas e
 * riscaldamento). Nessuna casella per i mestieri senza impianti.
 */
export function InstallerQualificationsPicker({
  categorySlugs,
  value,
  onChange,
}: {
  categorySlugs: readonly ProfessionalCategorySlug[];
  value: readonly string[];
  onChange: (next: string[]) => void;
}) {
  const options = installerQualificationsFor(categorySlugs);
  if (options.length === 0) return null;
  const toggle = (letter: string) => onChange(value.includes(letter) ? value.filter((item) => item !== letter) : [...value, letter]);

  return (
    <YStack gap="2" role="group" aria-labelledby="abilitazioni-titolo">
      <Text id="abilitazioni-titolo" fontFamily="body" fontSize={16} fontWeight="600" color={brand.grafite}>
        Abilitazioni impianti (DM 37/08)
      </Text>
      <Text fontSize={13} color={brand.grafite70}>
        Spunta solo quelle scritte nella tua visura camerale. Sul profilo i clienti le vedono come dichiarate da te.
      </Text>
      <YStack gap="2">
        {options.map((option) => {
          const checked = value.includes(option.letter);
          return (
            <XStack
              key={option.letter}
              alignItems="center"
              gap="3"
              minHeight={44}
              cursor="pointer"
              onPress={() => toggle(option.letter)}
              onKeyDown={keyActivate(() => toggle(option.letter))}
              role="checkbox"
              aria-checked={checked}
              aria-label={`${option.label}, lettera ${option.letter.toUpperCase()}`}
            >
              <YStack
                width={22}
                height={22}
                borderRadius="2"
                borderWidth={2}
                borderColor={checked ? brand.cianografia : brand.filetto}
                backgroundColor={checked ? brand.cianografia : brand.calce}
                alignItems="center"
                justifyContent="center"
                flexShrink={0}
              >
                {checked ? <Icon name="check" size={14} strokeWidth={2} color="white" /> : null}
              </YStack>
              <Text fontWeight="600" color={brand.grafite} flexShrink={1}>
                {option.label}
              </Text>
              <Text fontSize={13} color={brand.grafite70} flexShrink={0}>
                lettera {option.letter.toUpperCase()}
              </Text>
            </XStack>
          );
        })}
      </YStack>
    </YStack>
  );
}
