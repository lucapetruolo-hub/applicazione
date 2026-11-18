"use client";

import type { ReactNode } from "react";
import { Icon, Text, YStack, brand, type IconName } from "@professionisti/ui";

/**
 * Pulsante dei contatti di un lavoro accettato (Chiama, WhatsApp, Email, Mappa,
 * Messaggi): tutti della stessa forma, icona sopra e scritta sotto come la scheda
 * di un contatto sul telefono, divisi in parti uguali sulla riga da telefono e da
 * computer. Stesso pulsante per il professionista ("Dettagli cliente") e per il
 * cliente (docs/changelog/2026-11-18-dettagli-cliente-chiari.md).
 */
export function ContactTile({
  icon,
  label,
  href,
  external,
  onPress,
  badge,
}: {
  icon: IconName;
  label: string;
  href?: string;
  external?: boolean;
  onPress?: () => void;
  badge?: ReactNode;
}) {
  const tile = (
    <YStack
      minHeight={60}
      alignItems="center"
      justifyContent="center"
      gap={4}
      paddingHorizontal={4}
      paddingVertical={8}
      borderRadius={10}
      backgroundColor={`${brand.cianografiaVelo} hover:#CDE7E7`}
      cursor="pointer"
      position="relative"
      {...(href ? {} : { role: "button", "aria-label": label, onPress, flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 })}
    >
      <Icon name={icon} size={20} color={brand.cianografiaScuro} strokeWidth={2} />
      <Text fontSize="13px xs:12px" fontWeight="700" color={brand.cianografiaScuro} numberOfLines={1}>
        {label}
      </Text>
      {badge ? (
        <YStack position="absolute" top={6} right={6}>
          {badge}
        </YStack>
      ) : null}
    </YStack>
  );
  if (!href) return tile;
  return (
    <a
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      aria-label={label}
      style={{ flex: "1 1 0", minWidth: 0, textDecoration: "none" }}
    >
      {tile}
    </a>
  );
}
