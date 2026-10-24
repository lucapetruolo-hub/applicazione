"use client";

import Image from "next/image";
import Link from "next/link";
import { Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { GlowLights } from "./GlowLights";

// Solo cose che il sito fa già (docs/CHANGELOG.md §307): "Richieste
// filtrate dall'IA · In arrivo" è stata tolta su scelta dell'utente perché
// prometteva una funzione che non c'è.
const COLUMNS = [
  {
    icon: "receipt-text" as const,
    title: "Agenda e preventivi",
    text: "Agenda, preventivi e fatturazione in un'unica dashboard. Senza fogli di calcolo o WhatsApp sparsi.",
  },
  {
    icon: "map-pin" as const,
    title: "Richieste della tua zona",
    text: "Ti arrivano le richieste dei clienti nel tuo raggio di lavoro, con foto e descrizione. Nessun costo per contatto.",
  },
];

/**
 * Sezione di acquisizione lato offerta: riquadro scuro con una foto di un
 * professionista al lavoro a lato (direzione "C" della homepage scelta
 * dall'utente, docs/CHANGELOG.md §219 — prima era un fondo verde pieno senza
 * persone). Foto: cottonbro studio, pexels.com/photo/6791546 (licenza Pexels,
 * uso commerciale libero senza attribuzione obbligatoria).
 *
 * Luci colorate sfocate che si muovono piano sul fondo scuro e due notifiche
 * d'esempio sopra la foto (idea presa dal sito Volt, scelta dall'utente solo
 * per questa sezione, docs/CHANGELOG.md §219): mostrano cosa arriva a un
 * professionista. Sono decorative (`aria-hidden`), stile in globals.css.
 */
export function ProCtaSection() {
  return (
    <YStack width="100%" paddingVertical="$8" paddingHorizontal="$4" alignItems="center">
      <div className="pro-cta">
        <GlowLights tone="scuro" />
        <YStack gap="$6" padding="$6" position="relative" $gtSm={{ padding: "$8" }}>
          <YStack gap="$3">
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
                  borderRadius={12}
                  backgroundColor="rgba(255,255,255,0.12)"
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                >
                  <Icon name={column.icon} size={22} color="white" strokeWidth={1.5} />
                </YStack>
                <YStack gap="$1" flex={1} minWidth={0}>
                  <Text fontFamily="$heading" fontWeight="600" fontSize="$6" color="white">
                    {column.title}
                  </Text>
                  <Text fontSize={16} color="rgba(255,255,255,0.85)">
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
          <div className="pro-cta-notif pro-cta-notif-top" aria-hidden>
            <span className="pro-cta-notif-icon" style={{ background: "#FF8A3D" }}>
              <Icon name="check" size={18} color="white" strokeWidth={2.5} />
            </span>
            <span>
              <strong>Preventivo accettato</strong>
              <small>€ 93 · giovedì 9:00</small>
            </span>
          </div>
          <div className="pro-cta-notif pro-cta-notif-bottom" aria-hidden>
            <span className="pro-cta-notif-icon" style={{ background: brand.cianografia }}>
              <Icon name="bell-ring" size={18} color="white" strokeWidth={2} />
            </span>
            <span>
              <strong>Nuova richiesta</strong>
              <small>Rubinetto che perde · Milano · 1 foto</small>
            </span>
          </div>
        </div>
      </div>
    </YStack>
  );
}
