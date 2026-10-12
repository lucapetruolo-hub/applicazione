"use client";

import Image from "next/image";
import Link from "next/link";
import { Eyebrow, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";

const COLUMNS = [
  {
    icon: "receipt-text" as const,
    title: "Agenda e preventivi",
    text: "Agenda, preventivi e fatturazione in un'unica dashboard. Senza fogli di calcolo o WhatsApp sparsi.",
    comingSoon: false,
  },
  {
    icon: "sparkles" as const,
    title: "Richieste filtrate dall'IA",
    text: 'Il cliente carica una foto, il sistema propone categoria e fascia di budget. A te arriva già classificata, non un "ciao quanto costa?".',
    // Richiesta esplicita dell'utente: nessuna classificazione automatica
    // via IA è implementata (il cliente sceglie la categoria a mano in
    // GuidedRequestForm) — a differenza del giro precedente, qui l'utente
    // ha chiesto esplicitamente di pubblicarla comunque marcata "In
    // arrivo", non come funzionalità già attiva.
    comingSoon: true,
  },
];

/**
 * Sezione di acquisizione lato offerta: riquadro scuro con una foto di un
 * professionista al lavoro a lato (direzione "C" della homepage scelta
 * dall'utente, docs/CHANGELOG.md §219 — prima era un fondo verde pieno senza
 * persone). Foto: cottonbro studio, pexels.com/photo/6791546 (licenza Pexels,
 * uso commerciale libero senza attribuzione obbligatoria).
 */
export function ProCtaSection() {
  return (
    <YStack width="100%" paddingVertical="$8" paddingHorizontal="$4" alignItems="center">
      <div className="pro-cta">
        <YStack gap="$6" padding="$6" $gtSm={{ padding: "$8" }}>
          <YStack gap="$3">
            <Eyebrow tone="dark">Per chi offre servizi</Eyebrow>
            <Text fontFamily="$heading" fontWeight="600" fontSize="$9" color="white">
              Meno telefonate inutili, più lavoro concluso.
            </Text>
          </YStack>

          <YStack gap="$5">
            {COLUMNS.map((column) => (
              <XStack key={column.title} gap="$3" alignItems="flex-start">
                <YStack
                  width={44}
                  height={44}
                  borderRadius={16}
                  backgroundColor="rgba(255,255,255,0.12)"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  <Icon name={column.icon} size={22} color="white" strokeWidth={1.5} />
                </YStack>
                <YStack gap="$1" flex={1} minWidth={0}>
                  <XStack alignItems="center" gap="$2" flexWrap="wrap">
                    <Text fontFamily="$heading" fontWeight="600" fontSize="$6" color="white">
                      {column.title}
                    </Text>
                    {column.comingSoon ? (
                      <XStack backgroundColor="rgba(255,255,255,0.18)" paddingHorizontal={8} paddingVertical={2} borderRadius={999}>
                        <Text fontSize={11} fontWeight="700" color="white">
                          In arrivo
                        </Text>
                      </XStack>
                    ) : null}
                  </XStack>
                  <Text fontSize="$4" color="rgba(255,255,255,0.85)">
                    {column.text}
                  </Text>
                </YStack>
              </XStack>
            ))}
          </YStack>

          <XStack gap="$3" flexWrap="wrap">
            <Link href="/registrati?ruolo=professionista" style={{ textDecoration: "none" }}>
              <XStack backgroundColor="white" paddingHorizontal="$5" height={48} alignItems="center" borderRadius={999} cursor="pointer">
                <Text color={brand.cianografiaScuro} fontWeight="700">
                  Iscriviti gratis
                </Text>
              </XStack>
            </Link>
            <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
              <XStack
                borderWidth={1.5}
                borderColor="rgba(255,255,255,0.6)"
                paddingHorizontal="$5"
                height={48}
                alignItems="center"
                borderRadius={999}
                cursor="pointer"
              >
                <Text color="white" fontWeight="700">
                  Vedi i piani
                </Text>
              </XStack>
            </Link>
          </XStack>
        </YStack>
        <div className="pro-cta-photo">
          <Image
            src="/home-photos/professionista-al-lavoro.webp"
            alt="Un falegname al lavoro nella sua bottega"
            fill
            sizes="(max-width: 860px) 100vw, 556px"
            style={{ objectFit: "cover" }}
          />
        </div>
      </div>
    </YStack>
  );
}
