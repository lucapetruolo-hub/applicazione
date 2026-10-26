"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ProfessionalSearchResult } from "@professionisti/shared";
import { Avatar, BadgeInfo, Icon, Rating, Section, Text, XStack, brand } from "@professionisti/ui";
import { BRAND, professionalPath } from "@professionisti/shared";
import { CategoryIcon, CATEGORY_ACCENT } from "./icons/CategoryIcons";
import { useRevealOnScroll } from "./useRevealOnScroll";

// "Ultimi iscritti" (richiesta esplicita dell'utente): 21 profili, non una
// vetrina curata — nessuna soglia minima come la vecchia lista d'attesa (quella
// esiste per non far sembrare vuota una "vetrina in evidenza", questo è
// semplicemente l'elenco dei più recenti, corretto anche con pochi profili).
const VISIBLE_COUNT = 21;
// Badge "Nuovo" per i profili creati negli ultimi 30 giorni (portato qui
// dalla vecchia vetrina di ProfessionalsShowcase, docs/CHANGELOG.md §219).
const NEW_PROFILE_WINDOW_DAYS = 30;
// Stesso tetto alla cascata delle altre card animate in home (CLAUDE.md §105).
const MAX_STAGGER_MS = 480;
const CARD_GAP = 16;

const FALLBACK_ACCENT = { bg: "#E4E2DE", fg: "#45423D" };

/**
 * "Nuovi profili su Professionisti" — elenco degli ultimi 21 professionisti
 * iscritti, dalla stessa prop `professionals` già scaricata per l'intera home
 * (nessuna nuova chiamata API), riordinata per createdAt discendente.
 *
 * Card a "biglietto da visita" (idea C scelta dall'utente, docs/CHANGELOG.md
 * §232): fascia in alto col colore e l'icona della categoria, foto grande al
 * centro, "iscritto N giorni fa". Sotto la striscia una barra mostra a che
 * punto si è e, da computer, le frecce; bordi sfumati per far capire che la
 * striscia continua. `overflow-y: hidden` sulla striscia: senza, la rotellina
 * del mouse la spostava di qualche pixel in verticale (§232).
 *
 * Gli stili delle card vivono qui con `:global(...)` sotto `.npc-root`:
 * `<style jsx>` non applica le sue classi ai nodi di un altro componente
 * (`NewProfileCard`).
 */
export function NewProfilesCarousel({
  professionals,
}: {
  professionals: ProfessionalSearchResult[];
}) {
  // Fuori da React Compiler: usa `<style jsx>` (docs/CHANGELOG.md §345).
  "use no memo";
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState({ start: 0, size: 1 });

  function updateProgress() {
    const track = trackRef.current;
    if (!track || track.scrollWidth === 0) return;
    setProgress({
      start: track.scrollLeft / track.scrollWidth,
      size: Math.min(1, track.clientWidth / track.scrollWidth),
    });
  }

  useEffect(() => {
    updateProgress();
    window.addEventListener("resize", updateProgress);
    return () => window.removeEventListener("resize", updateProgress);
  }, [professionals]);

  if (professionals.length === 0) return null;

  const newest = [...professionals]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, VISIBLE_COUNT);

  function scrollByCard(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-new-profile-card]");
    const step = card ? card.getBoundingClientRect().width + CARD_GAP : track.clientWidth;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  const atStart = progress.start <= 0.001;
  const atEnd = progress.start + progress.size >= 0.999;

  return (
    <Section title={`Appena arrivati su ${BRAND.name}`} maxWidth={1160}>
      <div className="npc-root">
        <div
          ref={trackRef}
          className={`npc-track${atStart ? "" : " npc-track--fade-start"}${atEnd ? "" : " npc-track--fade-end"}`}
          onScroll={updateProgress}
        >
          {newest.map((pro, index) => (
            <NewProfileCard key={pro.id} pro={pro} delayMs={Math.min(index * 70, MAX_STAGGER_MS)} />
          ))}
        </div>

        {progress.size < 1 ? (
          <div className="npc-controls">
            <div className="npc-progress" aria-hidden="true">
              <span
                className="npc-progress-thumb"
                style={{ left: `${progress.start * 100}%`, width: `${progress.size * 100}%` }}
              />
            </div>
            <div className="npc-arrows">
              <button
                type="button"
                className="npc-arrow category-carousel-arrow"
                aria-label="Profili precedenti"
                disabled={atStart}
                onClick={() => scrollByCard(-1)}
              >
                <Icon name="chevron-left" size={18} color={brand.grafite} />
              </button>
              <button
                type="button"
                className="npc-arrow npc-arrow--next category-carousel-arrow"
                aria-label="Profili successivi"
                disabled={atEnd}
                onClick={() => scrollByCard(1)}
              >
                <Icon name="chevron-right" size={18} color={brand.calce} />
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .npc-root {
          width: 100%;
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .npc-track {
          display: flex;
          gap: ${CARD_GAP}px;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-snap-type: x mandatory;
          scrollbar-width: none;
          --npc-fade-start: 0px;
          --npc-fade-end: 0px;
          -webkit-mask-image: linear-gradient(
            90deg,
            transparent 0,
            #000 var(--npc-fade-start),
            #000 calc(100% - var(--npc-fade-end)),
            transparent 100%
          );
          mask-image: linear-gradient(
            90deg,
            transparent 0,
            #000 var(--npc-fade-start),
            #000 calc(100% - var(--npc-fade-end)),
            transparent 100%
          );
        }
        .npc-track--fade-start {
          --npc-fade-start: 40px;
        }
        .npc-track--fade-end {
          --npc-fade-end: 40px;
        }
        .npc-track::-webkit-scrollbar {
          display: none;
        }
        .npc-root :global(.npc-card) {
          flex-shrink: 0;
          width: 72%;
          scroll-snap-align: start;
        }
        @media (min-width: 700px) {
          .npc-root :global(.npc-card) {
            width: calc((100% - ${CARD_GAP * 2}px) / 3);
          }
        }
        @media (min-width: 1000px) {
          .npc-root :global(.npc-card) {
            width: calc((100% - ${CARD_GAP * 3}px) / 4);
          }
        }
        .npc-controls {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .npc-progress {
          position: relative;
          flex: 1;
          height: 4px;
          border-radius: 2px;
          background: ${brand.filetto};
          overflow: hidden;
        }
        .npc-progress-thumb {
          position: absolute;
          top: 0;
          bottom: 0;
          border-radius: 2px;
          background: ${brand.cianografiaPieno};
          transition: left 120ms linear;
        }
        .npc-arrows {
          display: flex;
          gap: 8px;
        }
        .npc-arrow {
          width: 42px;
          height: 42px;
          border-radius: 21px;
          border: none;
          background: ${brand.calce};
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: opacity 160ms ease;
        }
        .npc-arrow--next {
          background: ${brand.grafite};
        }
        .npc-arrow:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .npc-root :global(.npc-link) {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: ${brand.calce};
          border-radius: 24px;
          overflow: hidden;
          text-decoration: none;
          color: inherit;
          transition: box-shadow 160ms ease;
        }
        .npc-root :global(.npc-link:hover) {
          box-shadow: 0 10px 24px rgba(43, 32, 19, 0.08);
        }
        .npc-root :global(.npc-band) {
          position: relative;
          height: 88px;
          flex-shrink: 0;
        }
        .npc-root :global(.npc-chip) {
          position: absolute;
          top: 12px;
          left: 12px;
          display: flex;
          align-items: center;
          gap: 5px;
          max-width: calc(100% - 90px);
          padding: 4px 10px 4px 7px;
          border-radius: 999px;
          background: ${brand.calce};
        }
        .npc-root :global(.npc-new) {
          position: absolute;
          top: 12px;
          right: 12px;
          display: flex;
          padding: 4px 10px;
          border-radius: 999px;
          background: ${brand.cianografiaPieno};
        }
        .npc-root :global(.npc-photo) {
          position: absolute;
          left: 50%;
          bottom: -42px;
          transform: translateX(-50%);
          border-radius: 50%;
          background: ${brand.calce};
          padding: 4px;
        }
        .npc-root :global(.npc-body) {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: 4px;
          flex: 1;
          padding: 52px 18px 18px;
        }
        .npc-root :global(.npc-cta) {
          margin-top: auto;
          align-self: stretch;
          padding: 9px;
          border-radius: 999px;
          border: 1.5px solid ${brand.cianografia};
          text-align: center;
        }
      `}</style>
    </Section>
  );
}

function NewProfileCard({ pro, delayMs }: { pro: ProfessionalSearchResult; delayMs: number }) {
  const { ref, style } = useRevealOnScroll(delayMs);
  const accent = CATEGORY_ACCENT[pro.categorySlug] ?? FALLBACK_ACCENT;

  return (
    <div ref={ref} data-new-profile-card className="npc-card" style={style}>
      <Link href={professionalPath(pro)} className="npc-link">
        <div className="npc-band" style={{ backgroundColor: accent.bg }}>
          <span className="npc-chip">
            <CategoryIcon slug={pro.categorySlug} size={14} color={accent.fg} />
            <Text fontSize={13} lineHeight={16} fontWeight="700" color={accent.fg} numberOfLines={1}>
              {pro.categoryLabel}
            </Text>
          </span>
          {isNewProfile(pro.createdAt) ? (
            <span className="npc-new">
              <Text fontSize={13} lineHeight={16} fontWeight="700" color={brand.calce}>
                Nuovo
              </Text>
            </span>
          ) : null}
          <span className="npc-photo" style={{ boxShadow: `0 0 0 3px ${accent.bg}` }}>
            <Avatar name={pro.businessName} imageUrl={pro.imageUrl} size={80} />
          </span>
        </div>

        <div className="npc-body">
          <Text fontFamily="$heading" fontWeight="700" fontSize={18} color={brand.grafite} numberOfLines={1}>
            {pro.businessName}
          </Text>
          <Text fontSize={16} color={brand.grafite70} numberOfLines={1}>
            {pro.city} · iscritto {joinedAgo(pro.createdAt)}
          </Text>
          <XStack alignItems="center" justifyContent="center" gap="$2" flexWrap="wrap" minHeight={22} marginBottom="$3">
            {pro.rating !== null ? (
              <Rating value={pro.rating} size={13} />
            ) : (
              <Text fontSize={16} color={brand.grafite70}>
                Ancora nessuna recensione
              </Text>
            )}
            {pro.verified ? (
              <BadgeInfo info="verified">
                <XStack alignItems="center" gap={3}>
                  <Icon name="badge-check" size={13} color={brand.verificato} strokeWidth={2} />
                  <Text fontSize={13} fontWeight="700" color={brand.verificato}>
                    Verificato
                  </Text>
                </XStack>
              </BadgeInfo>
            ) : null}
          </XStack>
          <span className="npc-cta">
            <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
              Mostra profilo
            </Text>
          </span>
        </div>
      </Link>
    </div>
  );
}

function isNewProfile(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < NEW_PROFILE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function joinedAgo(createdAt: string): string {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days <= 0) return "oggi";
  if (days === 1) return "ieri";
  if (days < 30) return `${days} giorni fa`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "un mese fa" : `${months} mesi fa`;
  const years = Math.floor(months / 12);
  return years === 1 ? "un anno fa" : `${years} anni fa`;
}
