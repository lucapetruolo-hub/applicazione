"use client";

import type { ReactNode } from "react";
import { Icon, Section, Text, YStack } from "@professionisti/ui";

const POINTS = [
  {
    icon: "file-text" as const,
    title: "Preventivo strutturato",
    text: "Manodopera, materiali e tempi sempre separati: mai una cifra unica senza dettaglio.",
  },
  {
    icon: "star" as const,
    title: "Recensioni solo da lavori conclusi",
    text: "Nessuna recensione libera: solo chi ha davvero prenotato un intervento può lasciarne una.",
  },
  {
    icon: "map-pin" as const,
    title: "Privacy garantita",
    text: "Il tuo indirizzo esatto non compare mai in ricerca o nel profilo pubblico: lo vede solo il professionista a cui scrivi.",
  },
];

/**
 * Sostituisce la sezione "Consigli dai professionisti + Recensioni" del
 * brief §4.5: quelle recensioni erano dati di esempio hardcoded (mai
 * pubblicate, vedi CLAUDE.md §10 — "se le recensioni non sono reali,
 * l'intera sezione non va pubblicata"). Al loro posto, il processo reale
 * che rende affidabile il sistema di reputazione — stesso fondo grafite,
 * unico blocco scuro della pagina, per non perdere lo spezzare il ritmo
 * dello scroll previsto dal brief.
 *
 * In homepage contiene anche la Garanzia Piattaforma (`children`): erano due
 * sezioni in fila sullo stesso tema, unite in "Perché fidarsi"
 * (docs/CHANGELOG.md §219).
 */
export function QualitySection({ children }: { children?: ReactNode }) {
  return (
    <Section
      tone="dark"
      title="La trasparenza che non trovi in giro"
      maxWidth={1080}
    >
      <YStack width="100%" flexDirection="column" $gtMd={{ flexDirection: "row" }} gap="$6" data-stagger="">
        {POINTS.map((point) => (
          <YStack key={point.title} flex={1} gap="$3">
            <YStack
              width={44}
              height={44}
              borderRadius={22}
              backgroundColor="rgba(255,255,255,0.1)"
              alignItems="center"
              justifyContent="center"
            >
              <Icon name={point.icon} size={20} color="white" strokeWidth={1.5} />
            </YStack>
            <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color="white">
              {point.title}
            </Text>
            <Text fontSize={16} color="rgba(255,255,255,0.7)">
              {point.text}
            </Text>
          </YStack>
        ))}
      </YStack>
      {children}
    </Section>
  );
}
