"use client";

import Link from "next/link";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

const COLUMNS = [
  {
    icon: "receipt-text" as const,
    title: "Agenda e preventivi",
    text: "Gestisci richieste, agenda e fatturazione da un'unica dashboard, senza fogli di calcolo o WhatsApp sparsi.",
  },
  {
    icon: "sparkles" as const,
    title: "Richieste filtrate dall'IA",
    text: "Il cliente carica una foto, il sistema propone categoria e fascia di budget: a te arriva già classificata, non un testo generico.",
  },
];

/**
 * Sezione di acquisizione lato offerta (brief §4.7): fondo cianografia
 * pieno, testo bianco — cambia pubblico, cambia colore, per segnalarlo
 * visivamente invece di lasciarla indistinguibile dal resto come prima
 * del redesign.
 */
export function ProCtaSection() {
  return (
    <YStack width="100%" backgroundColor="$cianografia" paddingVertical="$9" paddingHorizontal="$4" alignItems="center" borderTopWidth={2} borderTopColor="$cianografiaScuro">
      <YStack width="100%" maxWidth={1080} gap="$6">
        <YStack gap="$3">
          <XStack alignItems="center" gap="$2">
            <YStack width={24} height={1} backgroundColor="rgba(255,255,255,0.5)" />
            <Text fontFamily="$mono" fontSize={11} fontWeight="500" letterSpacing={0.9} textTransform="uppercase" color="white">
              Per chi offre servizi
            </Text>
          </XStack>
          <Text fontFamily="$heading" fontWeight="800" fontSize="$9" color="white" maxWidth={560}>
            Le richieste arrivano già qualificate.
          </Text>
        </YStack>

        <YStack flexDirection="column" $gtMd={{ flexDirection: "row" }} gap="$6">
          {COLUMNS.map((column) => (
            <YStack key={column.title} flex={1} gap="$3">
              <Icon name={column.icon} size={28} color="white" strokeWidth={1.5} />
              <Text fontFamily="$heading" fontWeight="700" fontSize="$6" color="white">
                {column.title}
              </Text>
              <Text fontSize="$4" color="rgba(255,255,255,0.85)">
                {column.text}
              </Text>
            </YStack>
          ))}
        </YStack>

        <XStack gap="$3" flexWrap="wrap">
          <Link href="/registrati?ruolo=professionista" style={{ textDecoration: "none" }}>
            <XStack backgroundColor="white" paddingHorizontal="$5" height={48} alignItems="center" borderRadius="$2" cursor="pointer">
              <Text color={brand.cianografia} fontWeight="700">
                Iscriviti gratis
              </Text>
            </XStack>
          </Link>
          <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
            <XStack
              borderWidth={1}
              borderColor="rgba(255,255,255,0.6)"
              paddingHorizontal="$5"
              height={48}
              alignItems="center"
              borderRadius="$2"
              cursor="pointer"
            >
              <Text color="white" fontWeight="700">
                Vedi i piani
              </Text>
            </XStack>
          </Link>
        </XStack>
      </YStack>
    </YStack>
  );
}
