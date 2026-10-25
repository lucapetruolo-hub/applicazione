"use client";

import { useState, type ReactNode } from "react";
import { Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";

/**
 * Riga che si apre e si chiude, per la trattativa sotto il biglietto
 * dell'appuntamento (docs/CHANGELOG.md §341): preventivo accettato, foto,
 * preventivi non scelti. Chiusa resta una riga sola con il riassunto.
 */
export function Disclosure({ title, summary, muted, defaultOpen = false, children }: { title: string; summary?: string; muted?: boolean; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <YStack borderRadius={radiusDoc} borderWidth={1} borderColor={brand.filetto} backgroundColor={muted ? "transparent" : brand.calce} overflow="hidden">
      <XStack
        alignItems="center"
        gap="$2"
        paddingHorizontal="$4"
        paddingVertical="$3"
        minHeight={52}
        cursor="pointer"
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        aria-expanded={open}
        hoverStyle={{ backgroundColor: brand.gesso }}
      >
        <Text flex={1} minWidth={0} fontSize={16} numberOfLines={open ? undefined : 1}>
          <Text fontSize={16} fontWeight={muted ? "500" : "700"} color={muted ? brand.grafite70 : brand.grafite}>
            {title}
          </Text>
          {summary ? (
            <Text fontSize={16} color={brand.grafite70}>
              {` · ${summary}`}
            </Text>
          ) : null}
        </Text>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={20} color={brand.grafite70} />
      </XStack>
      {open ? (
        <YStack paddingHorizontal="$3" paddingBottom="$3" gap="$2">
          {children}
        </YStack>
      ) : null}
    </YStack>
  );
}
