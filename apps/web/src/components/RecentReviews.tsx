"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Icon, Rating, Section, Text, XStack, YStack, brand, motionEasing, motionFast } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CategoryIcon, CATEGORY_ACCENT } from "./icons/CategoryIcons";
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
 * Terzo giro di redesign, richiesta esplicita dell'utente: foto del
 * professionista grande sul lato sinistro della scheda (non più un piccolo
 * avatar nel footer, §107), commento a destra. La foto occupa l'intera
 * altezza della card (`next/image fill`, angoli sinistri arrotondati come la
 * card) — nessun avatar duplicato più in basso. Stesso principio "foto vera
 * o icona colorata, mai un placeholder generico" già in uso per
 * `ProfessionalAvatar`/`CategoryIconBadge`, qui costruito su misura (quei due
 * componenti rendono solo un quadrato/cerchio a dimensione fissa, non un
 * pannello rettangolare a piena altezza) — fallback sulla stessa icona
 * colorata per categoria (`CATEGORY_ACCENT`/`CategoryIcon`) quando il
 * professionista non ha ancora un'immagine profilo.
 *
 * Bug reale corretto nello stesso giro ("le schede si muovono su e giù
 * quando non dovrebbero"): l'hover della card applicava `transform:
 * translateY(-4px)` insieme a `onHoverIn`/`onHoverOut` — uno spostamento via
 * transform sposta anche l'area di hit-testing del pointer, quindi con il
 * cursore vicino al bordo il movimento poteva far uscire il cursore
 * dall'elemento (mouseleave → hover false → torna giù → cursore di nuovo
 * dentro → mouseenter → hover true → ...), un loop di oscillazione visibile
 * come "le schede si muovono su e giù" da sole. Rimosso il `transform` dallo
 * stato hover, resta solo l'ombra (che non sposta il box, nessun rischio di
 * flicker) — stesso identico pattern (`onHoverIn`/`onHoverOut` +
 * `translateY`) presente anche in `NewProfileCard` (`NewProfilesCarousel.tsx`),
 * non toccato qui: la segnalazione dell'utente riguardava solo le
 * recensioni, fuori scope estendere il fix a quel file in questo giro.
 *
 * Quarto giro, richiesta esplicita dell'utente ("rendi più dinamico...
 * tipo che scorrono da sole"): la corsia scorre ora da sola in autonomo,
 * niente più fermo in attesa che qualcuno clicchi le freccette. Loop
 * infinito via `scrollLeft` incrementato a ogni frame (`requestAnimationFrame`,
 * non `scroll-behavior:smooth`/CSS `animation` — serve poter leggere e
 * resettare la posizione di scroll reale per il wrap-around, vedi sotto),
 * con l'elenco duplicato una volta (`[...reviews, ...reviews]`): quando lo
 * scroll raggiunge la metà esatta della larghezza totale si sottrae quella
 * metà da `scrollLeft` — un salto istantaneo impercettibile perché la
 * seconda metà è identica alla prima, l'effetto è un nastro che scorre senza
 * mai fermarsi. Le freccette restano (scorrimento manuale più rapido a
 * comando), disattivano l'autoplay al passaggio del mouse/focus e lo
 * riattivano dopo un breve fermo — stesso principio già in uso per l'hover
 * delle card. Bug da evitare qui (segnalato esplicitamente dall'utente in
 * un giro precedente): l'autoplay non deve mai intercettare lo scroll
 * verticale della pagina — per questo resta deliberatamente un puro
 * `scrollLeft` via rAF, senza alcun listener `onWheel`/`preventDefault`:
 * il mouse wheel verticale continua a scorrere la pagina normalmente anche
 * con il cursore fermo sopra le recensioni, l'autoplay usa solo lo stato
 * hover per mettersi in pausa. `scroll-snap-type` rimosso (in conflitto
 * visivo con l'incremento continuo di `scrollLeft`, causava micro-scatti
 * mentre il browser tentava di agganciare la card più vicina a ogni frame).
 * `prefers-reduced-motion` già coperto dalla regola globale in
 * `globals.css` che azzera `animation`, ma qui la spinta è un `scrollLeft`
 * JS puro — fermata esplicitamente controllando `matchMedia` una sola volta
 * all'avvio (nessun listener di resize, la preferenza non cambia a
 * runtime).
 *
 * Bug reale corretto nello stesso giro ("non vedo ancora che scorre"): con
 * poche recensioni (es. una sola) il vecchio raddoppio (`[...reviews,
 * ...reviews]`) non garantiva overflow reale — a `min-width:700px` ogni
 * card occupa metà della corsia (`.rr-card`, globals.css), quindi con una
 * sola recensione due copie riempivano esattamente il 100% della corsia:
 * `scrollWidth === clientWidth`, zero margine di scroll, l'autoplay
 * incrementava `scrollLeft` ma il browser lo clampava subito a 0 — nessun
 * movimento visibile. Triplicato (`[...reviews, ...reviews, ...reviews]`,
 * wrap-around a un terzo della larghezza totale) per garantire overflow
 * reale qualunque sia il numero di recensioni. Velocità anche raddoppiata
 * (0.6 → 1.4px/frame): a 0.6 il movimento era tecnicamente presente ma
 * troppo lento per essere notato a un primo sguardo.
 */
const AUTOPLAY_PX_PER_FRAME = 1.4;
const AUTOPLAY_RESUME_DELAY_MS = 2500;
const LOOP_COPIES = 3;

export function RecentReviews() {
  const [reviews, setReviews] = useState<RecentReview[] | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    apiClient
      .getRecentReviews()
      .then(setReviews)
      .catch(() => setReviews([]));
  }, []);

  useEffect(() => {
    if (!reviews || reviews.length === 0) return undefined;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    let frameId: number;
    function tick() {
      const track = trackRef.current;
      if (track && !pausedRef.current) {
        const copyWidth = track.scrollWidth / LOOP_COPIES;
        if (copyWidth > 0) {
          track.scrollLeft += AUTOPLAY_PX_PER_FRAME;
          if (track.scrollLeft >= copyWidth) {
            track.scrollLeft -= copyWidth;
          }
        }
      }
      frameId = requestAnimationFrame(tick);
    }
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [reviews]);

  if (!reviews || reviews.length === 0) return null;

  function pauseAutoplay() {
    pausedRef.current = true;
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
  }

  function resumeAutoplaySoon() {
    if (resumeTimeoutRef.current) clearTimeout(resumeTimeoutRef.current);
    resumeTimeoutRef.current = setTimeout(() => {
      pausedRef.current = false;
    }, AUTOPLAY_RESUME_DELAY_MS);
  }

  function scrollByCard(direction: 1 | -1) {
    const track = trackRef.current;
    if (!track) return;
    pauseAutoplay();
    const card = track.querySelector<HTMLElement>("[data-review-card]");
    const step = card ? card.getBoundingClientRect().width + 20 : track.clientWidth;
    track.scrollBy({ left: direction * step, behavior: "smooth" });
    resumeAutoplaySoon();
  }

  const loopedReviews = Array.from({ length: LOOP_COPIES }, () => reviews).flat();

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

        <div
          ref={trackRef}
          className="rr-track"
          onMouseEnter={pauseAutoplay}
          onMouseLeave={resumeAutoplaySoon}
          onFocus={pauseAutoplay}
          onBlur={resumeAutoplaySoon}
          onTouchStart={pauseAutoplay}
          onTouchEnd={resumeAutoplaySoon}
        >
          {loopedReviews.map((review, index) => (
            <ReviewCard
              key={`${review.id}-${index}`}
              review={review}
              delayMs={index < reviews.length ? Math.min(index * 90, MAX_STAGGER_MS) : 0}
            />
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
  const profileHref = `/professionista/${review.professional.id}`;
  const accent = CATEGORY_ACCENT[review.professional.categorySlug as keyof typeof CATEGORY_ACCENT] ?? {
    bg: "#F1F5F9",
    fg: "#334155",
  };

  return (
    <div ref={ref} data-review-card className="rr-card" style={style}>
      <XStack
        width="100%"
        height="100%"
        minHeight={240}
        backgroundColor={brand.calce}
        borderRadius={24}
        overflow="hidden"
        cursor="default"
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        style={{
          // Solo l'ombra cambia all'hover, mai un transform: uno spostamento
          // via translateY sposta anche l'area di hit-testing del pointer,
          // causando un loop mouseleave/mouseenter (la card "oscilla" da
          // sola) quando il cursore resta vicino al bordo — vedi commento in
          // cima al file.
          boxShadow: hovered ? "0 10px 24px rgba(43,32,19,0.08)" : "none",
          transition: `box-shadow ${motionFast} ${motionEasing}`,
        }}
      >
        {/* Foto grande del professionista, a piena altezza della card —
            richiesta esplicita dell'utente. Foto vera se presente,
            altrimenti la stessa icona colorata per categoria già in uso
            altrove nel sito (mai un placeholder generico). */}
        <Link href={profileHref} className="rr-photo" aria-label={review.professional.businessName}>
          {review.professional.imageUrl ? (
            <Image
              src={review.professional.imageUrl}
              alt=""
              fill
              sizes="(min-width: 700px) 180px, 140px"
              style={{ objectFit: "cover" }}
            />
          ) : (
            <YStack width="100%" height="100%" alignItems="center" justifyContent="center" backgroundColor={accent.bg}>
              <CategoryIcon slug={review.professional.categorySlug} size={44} color={accent.fg} />
            </YStack>
          )}
        </Link>

        <YStack flex={1} flexBasis={0} minWidth={0} gap="$2" padding="$5">
          <Text fontFamily="$heading" fontSize={40} lineHeight={30} fontWeight="700" color={brand.cianografiaVelo} userSelect="none">
            &ldquo;
          </Text>

          <Text fontSize={15} lineHeight={23} color={brand.grafite} marginTop={-12} numberOfLines={4}>
            {review.isAutomatic ? "Recensione automatica: lavoro completato, nessun commento scritto dal cliente." : review.comment ?? ""}
          </Text>

          <XStack justifyContent="flex-end">
            <Text fontSize={13} color={brand.grafite70} numberOfLines={1}>
              — {review.clientName}
            </Text>
          </XStack>

          <XStack height={1} backgroundColor={brand.filetto} width="100%" marginTop="$1" />

          <YStack gap={4}>
            <Link href={profileHref} style={{ textDecoration: "none" }}>
              <Text fontFamily="$heading" fontSize={15} fontWeight="700" color={brand.cianografia} numberOfLines={1}>
                {review.professional.businessName}
              </Text>
            </Link>
            <Text fontSize={12} color={brand.grafite70} numberOfLines={1}>
              {review.professional.categoryLabel} · {review.professional.city}
            </Text>
            <XStack alignItems="center" gap="$2">
              <Rating value={review.rating} size={12} />
              <XStack alignItems="center" gap={3}>
                <Icon name="badge-check" size={11} color={brand.verificato} strokeWidth={2} />
                <Text fontFamily="$body" fontSize={10} fontWeight="700" color={brand.verificato}>
                  Confermato
                </Text>
              </XStack>
            </XStack>
          </YStack>
        </YStack>
      </XStack>
    </div>
  );
}
