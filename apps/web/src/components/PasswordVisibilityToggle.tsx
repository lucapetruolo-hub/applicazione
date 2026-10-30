"use client";

import { Icon, XStack, brand } from "@professionisti/ui";

/**
 * Occhio "Mostra password" dentro il campo: area di tocco 44x44 attorno
 * all'icona da 18, prima era grande quanto l'icona (collaudo L-13, D-08;
 * docs/changelog/2026-10-30-tastiera.md). Margini negativi: il campo resta
 * alto com'era.
 */
export function PasswordVisibilityToggle({ visible, onToggle }: { visible: boolean; onToggle: () => void }) {
  return (
    <XStack
      width={44}
      height={44}
      marginVertical={-8}
      marginRight={-12}
      borderRadius={999}
      alignItems="center"
      justifyContent="center"
      cursor="pointer"
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={visible ? "Nascondi password" : "Mostra password"}
    >
      <Icon name={visible ? "eye-off" : "eye"} size={18} strokeWidth={1.5} color={brand.grafite70} />
    </XStack>
  );
}
