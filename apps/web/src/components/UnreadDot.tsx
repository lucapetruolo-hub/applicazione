"use client";

import { Text, XStack, brand } from "@professionisti/ui";

/**
 * Pallino rosso con numero, mostrato accanto a un bottone/link — richiesta
 * esplicita dell'utente: "aggiungere un pallino rosso di fianco al pulsante
 * contatta/cronologia con un numero all'interno del numero degli
 * aggiornamenti ricevuti". Stesso stile del pallino già in uso per il
 * conteggio per tab (`/dashboard/richieste`), qui riusato come componente
 * condiviso invece di ripeterlo inline in ogni card. Non renderizza nulla se
 * `count` è 0/assente.
 */
export function UnreadDot({ count }: { count: number | undefined }) {
  if (!count) return null;
  return (
    <XStack
      minWidth={18}
      height={18}
      paddingHorizontal={4}
      borderRadius={999}
      backgroundColor={brand.urgenza}
      alignItems="center"
      justifyContent="center"
      accessibilityLabel={`${count} aggiornamenti non letti`}
    >
      <Text fontSize={11} fontWeight="800" color="white" lineHeight={14}>
        {count > 9 ? "9+" : count}
      </Text>
    </XStack>
  );
}
