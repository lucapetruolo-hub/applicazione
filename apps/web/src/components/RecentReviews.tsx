"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, Rating, Section, Text, XStack, YStack, brand, motionEasing, motionFast } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { ProfessionalAvatar } from "./ProfessionalAvatar";
import { useRevealOnScroll } from "./useRevealOnScroll";

type RecentReview = {
  id: string;
  rating: number;
  comment: string | null;
  isAutomatic: boolean;
  createdAt: string;
  clientName: string;
  professional: { id: string; businessName: string; categoryLabel: string; categorySlug: string; city: string; imageUrl: string | null };
};

// Stesso tetto alla cascata di NewProfilesCarousel.tsx (CLAUDE.md §105).
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
 * Riprova sociale reale in home (audit, punto J): le ultime recensioni
 * pubbliche della piattaforma, dallo stesso criterio "doppio cieco" della
 * pagina profilo (GET /reviews/recent). Mai una recensione inventata: se non
 * ce ne sono ancora, la sezione non viene proprio renderizzata.
 *
 * Redesign richiesto esplicitamente dall'utente ("non mi piace come si vede")
 * dopo un primo giro a due colonne (foto grande a sinistra, testo compresso a
 * destra — CLAUDE.md §96): quel layout stipava tutto (nome, categoria,
 * stelle, badge, testo, firma) in una colonna stretta accanto a una foto
 * enorme, con la citazione — il vero contenuto — ridotta a 4 righe minuscole
 * in corsivo. Qui la citazione diventa il centro della card (stile
 * testimonial editoriale: virgolette decorative + testo prominente), il
 * professionista scende a un footer identificativo sotto una linea divisoria
 * (avatar piccolo + nome cliccabile + categoria/città + stelle), e la firma
 * del cliente resta una didascalia discreta subito sopra il footer. Stesso
 * linguaggio visivo di `NewProfilesCarousel.tsx` (card `calce` a piena
 * altezza, radius 24, ombra solo all'hover, dimensionamento responsivo via
 * `<style jsx>`) invece del `Surface`+`CategoryCarousel` precedente — le due
 * sezioni sedevano una accanto all'altra in home con stili visibilmente
 * disallineati (bordo vs nessun bordo, larghezza fissa vs responsiva,
 * frecce duplicate in due implementazioni diverse).
 */
export function RecentReviews() {
  const [reviews, setReviews] = useState<RecentReview[] | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiClient
      .getRecentReviews()
      .then(setReviews)
      .catch(() => setReviews([]));
  }, []);

  if (!reviews || reviews.length === 0) return null;

  function scrollByCard(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    const card = track.querySelector<HTMLElement>("[data-review-card]");
    const step = card ? card.getBoundingClientRect().width + 20 : track.clientWidth;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
  }

  return (
    <Section eyebrow="Recensioni verificate" title="Chi ha già trovato il professionista giusto" maxWidth={1160}>
      <div className="rr-wrap">
        <div
          className="category-carousel-arrow"
          role="button"
          tabIndex={0}
          aria-label="Recensione precedente"
          onClick={() => scrollByCard(-1)}
          onKeyDown={(e) => e.key === "Enter" && scrollByCard(-1)}
          style={arrowStyle}
        >
          <Icon name="chevron-left" size={18} color={brand.grafite} />
        </div>

        <div ref={trackRef} className="rr-track">
          {reviews.map((review, index) => (
            <ReviewCard key={review.id} review={review} delayMs={Math.min(index * 90, MAX_STAGGER_MS)} />
          ))}
        </div>

        <div
          className="category-carousel-arrow"
          role="button"
          tabIndex={0}
          aria-label="Recensione successiva"
          onClick={() => scrollByCard(1)}
          onKeyDown={(e) => e.key === "Enter" && scrollByCard(1)}
          style={arrowStyle}
        >
          <Icon name="chevron-right" size={18} color={brand.grafite} />
        </div>
      </div>

      <style jsx>{`
        .rr-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
        }
        .rr-track {
          display: flex;
          gap: 20px;
          overflow-x: auto;
          flex: 1;
          min-width: 0;
          scroll-snap-type: x mandatory;
          padding-bottom: 4px;
          scrollbar-width: none;
        }
        .rr-track::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </Section>
  );
}

function ReviewCard({ review, delayMs }: { review: RecentReview; delayMs: number }) {
  const { ref, style } = useRevealOnScroll(delayMs);
  const [hovered, setHovered] = useState(false);

  return (
    <div ref={ref} data-review-card className="rr-card" style={style}>
      <YStack
        width="100%"
        height="100%"
        gap="$3"
        padding="$5"
        backgroundColor={brand.calce}
        borderRadius={24}
        cursor="default"
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={{
          boxShadow: hovered ? "0 10px 24px rgba(43,32,19,0.08)" : "none",
          transition: `transform ${motionFast} ${motionEasing}, box-shadow ${motionFast} ${motionEasing}`,
          transform: hovered ? "translateY(-4px)" : "none",
        }}
      >
        {/* Virgoletta decorativa: la citazione è il centro della card, non
            la foto del professionista (a differenza del giro precedente). */}
        <Text fontFamily="$heading" fontSize={56} lineHeight={40} fontWeight="700" color={brand.cianografiaVelo} userSelect="none">
          &ldquo;
        </Text>

        <Text fontSize={16} lineHeight={25} color={brand.grafite} marginTop={-24} numberOfLines={4}>
          {review.isAutomatic ? "Recensione automatica: lavoro completato, nessun commento scritto dal cliente." : review.comment ?? ""}
        </Text>

        <XStack justifyContent="flex-end">
          <Text fontSize={13} color={brand.grafite70}>
            — {review.clientName}
          </Text>
        </XStack>

        <XStack height={1} backgroundColor={brand.filetto} width="100%" marginTop="$1" />

        <XStack alignItems="center" gap="$3">
          <Link href={`/professionista/${review.professional.id}`} style={{ textDecoration: "none", flexShrink: 0 }}>
            <ProfessionalAvatar imageUrl={review.professional.imageUrl} categorySlug={review.professional.categorySlug} size={48} />
          </Link>
          <YStack flex={1} flexBasis={0} minWidth={0} gap={2}>
            <Link href={`/professionista/${review.professional.id}`} style={{ textDecoration: "none" }}>
              <Text fontFamily="$heading" fontSize={15} fontWeight="700" color={brand.cianografia} numberOfLines={1}>
                {review.professional.businessName}
              </Text>
            </Link>
            <Text fontSize={12} color={brand.grafite70} numberOfLines={1}>
              {review.professional.categoryLabel} · {review.professional.city}
            </Text>
          </YStack>
          <YStack alignItems="flex-end" gap={2} flexShrink={0}>
            <Rating value={review.rating} size={12} />
            <XStack alignItems="center" gap={3}>
              <Icon name="badge-check" size={11} color={brand.verificato} strokeWidth={2} />
              <Text fontFamily="$body" fontSize={10} fontWeight="700" color={brand.verificato}>
                Confermato
              </Text>
            </XStack>
          </YStack>
        </XStack>
      </YStack>
    </div>
  );
}
