"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { Avatar, Icon, Section, Text, XStack, YStack, brand, motionEasing, motionFast } from "@professionisti/ui";
import { useRevealOnScroll } from "./useRevealOnScroll";

// "Ultimi iscritti" (richiesta esplicita dell'utente): 21 profili, non una
// vetrina curata — nessuna soglia minima come ProfessionalsShowcase (quella
// esiste per non far sembrare vuota una "vetrina in evidenza", questo è
// semplicemente l'elenco dei più recenti, corretto anche con pochi profili).
const VISIBLE_COUNT = 21;
// Stesso tetto alla cascata di RecentReviews.tsx (CLAUDE.md §105).
const MAX_STAGGER_MS = 480;

const arrowStyle = {
  flexShrink: 0,
  width: 40,
  height: 40,
  borderRadius: 20,
  border: "none",
  backgroundColor: brand.calce,
  boxShadow: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  transition: `transform ${motionFast} ${motionEasing}`,
} as const;

/**
 * "Nuovi profili su Professionisti" — richiesta esplicita dell'utente, stile
 * miodottore.it (screenshot fornito): elenco degli ultimi 21 professionisti
 * iscritti. Stessa prop `professionals` già scaricata una volta per l'intera
 * home (nessuna nuova chiamata API), riordinata localmente per createdAt
 * discendente — stesso principio già in uso per ProfessionalsShowcase/
 * RealShowcase (l'ordinamento di ricerca vero, boost→rating→recensioni,
 * resta invariato ovunque altrove).
 *
 * Da cellulare un solo profilo visibile alla volta (scorrimento touch
 * nativo, coerente con lo screenshot fornito), da desktop tre alla volta con
 * freccette. Larghezza card responsiva (100% sotto i 700px, un terzo del
 * contenitore sopra) non esprimibile solo con prop Tamagui: media query via
 * <style jsx>, stesso principio già in uso per ResultsListWithMap/MegaMenu/
 * CalendarShell. Le freccette riusano la stessa classe globale
 * `.category-carousel-arrow` (globals.css) già nascosta su dispositivi
 * touch-only via `@media (hover:none)` — evita di duplicare quella regola.
 */
export function NewProfilesCarousel({ professionals }: { professionals: ProfessionalSearchResult[] }) {
  const trackRef = useRef<HTMLDivElement>(null);

  if (professionals.length === 0) return null;

  const newest = [...professionals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, VISIBLE_COUNT);

  function scrollByCard(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-new-profile-card]");
    const step = card ? card.getBoundingClientRect().width + 16 : track.clientWidth;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  return (
    <Section eyebrow="Nuovi profili" title="Nuovi profili su Professionisti" maxWidth={1160}>
      <div className="npc-wrap">
        <div
          className="category-carousel-arrow"
          role="button"
          tabIndex={0}
          aria-label="Profilo precedente"
          onClick={() => scrollByCard(-1)}
          onKeyDown={(e) => e.key === "Enter" && scrollByCard(-1)}
          style={arrowStyle}
        >
          <Icon name="chevron-left" size={18} color={brand.grafite} />
        </div>

        <div ref={trackRef} className="npc-track">
          {newest.map((pro, index) => (
            <NewProfileCard key={pro.id} pro={pro} delayMs={Math.min(index * 70, MAX_STAGGER_MS)} />
          ))}
        </div>

        <div
          className="category-carousel-arrow"
          role="button"
          tabIndex={0}
          aria-label="Profilo successivo"
          onClick={() => scrollByCard(1)}
          onKeyDown={(e) => e.key === "Enter" && scrollByCard(1)}
          style={arrowStyle}
        >
          <Icon name="chevron-right" size={18} color={brand.grafite} />
        </div>
      </div>

      <style jsx>{`
        .npc-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
        }
        .npc-track {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          flex: 1;
          min-width: 0;
          scroll-snap-type: x mandatory;
          padding-bottom: 4px;
          scrollbar-width: none;
        }
        .npc-track::-webkit-scrollbar {
          display: none;
        }
        .npc-card {
          flex-shrink: 0;
          width: 100%;
          scroll-snap-align: start;
        }
        @media (min-width: 700px) {
          .npc-card {
            width: calc((100% - 32px) / 3);
          }
        }
      `}</style>
    </Section>
  );
}

function NewProfileCard({ pro, delayMs }: { pro: ProfessionalSearchResult; delayMs: number }) {
  const { ref, style } = useRevealOnScroll(delayMs);
  const [hovered, setHovered] = useState(false);

  return (
    <div ref={ref} data-new-profile-card className="npc-card" style={style}>
      <Link href={`/professionista/${pro.id}`} style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
        <YStack
          width="100%"
          height="100%"
          gap="$3"
          padding="$5"
          backgroundColor={brand.calce}
          borderRadius={24}
          cursor="pointer"
          onHoverIn={() => setHovered(true)}
          onHoverOut={() => setHovered(false)}
          style={{
            // Ombra soltanto all'hover — stesso principio già stabilito nel
            // resto del sito (CLAUDE.md §19: "nessuna ombra di default",
            // un accenno resta solo dove una superficie si solleva
            // davvero sopra il resto, qui il gesto di hover stesso).
            boxShadow: hovered ? "0 10px 24px rgba(43,32,19,0.08)" : "none",
            transition: `transform ${motionFast} ${motionEasing}, box-shadow ${motionFast} ${motionEasing}`,
            transform: hovered ? "translateY(-4px)" : "none",
          }}
        >
          <XStack alignItems="center" gap="$3">
            {/* Foto più grande, coerente con l'ingrandimento richiesto sulla
                pagina profilo pubblica: anche qui deve riconoscersi bene chi
                è il professionista, non solo intuirlo da un'icona piccola. */}
            <Avatar name={pro.businessName} imageUrl={pro.imageUrl} size={88} />
            <YStack flex={1} minWidth={0} gap={2}>
              <Text fontWeight="700" fontSize={17} color={brand.grafite} numberOfLines={1}>
                {pro.businessName}
              </Text>
              <Text fontSize={13.5} color={brand.grafite70} numberOfLines={1}>
                {pro.categoryLabel}
              </Text>
              <Text fontSize={13.5} color={brand.grafite70} numberOfLines={1}>
                {pro.city}
              </Text>
            </YStack>
          </XStack>
          <Text fontWeight="600" fontSize={14} color={brand.cianografia}>
            Mostra profilo →
          </Text>
        </YStack>
      </Link>
    </div>
  );
}
