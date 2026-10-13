"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Avatar, Icon, Rating, Section, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { CategoryIcon, CATEGORY_ACCENT } from "./icons/CategoryIcons";

type RecentReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  clientName: string;
  professional: { id: string; businessName: string; categoryLabel: string; categorySlug: string; city: string; imageUrl: string | null };
};

// Ogni quanto passa da sola alla recensione successiva.
const ROTATE_MS = 6000;
// Spostamento orizzontale minimo del dito per cambiare recensione.
const SWIPE_MIN_PX = 50;
// Sotto questo numero di recensioni la media non dice ancora molto: non la
// mostriamo (docs/CHANGELOG.md §229).
const MIN_REVIEWS_FOR_AVERAGE = 10;

const FALLBACK_ACCENT = { bg: "#F1F5F9", fg: "#334155" };

function accentFor(slug: string) {
  return CATEGORY_ACCENT[slug as keyof typeof CATEGORY_ACCENT] ?? FALLBACK_ACCENT;
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat("it", { numeric: "auto" });
  if (days < 7) return rtf.format(-days, "day");
  if (days < 30) return rtf.format(-Math.floor(days / 7), "week");
  if (days < 365) return rtf.format(-Math.floor(days / 30), "month");
  return rtf.format(-Math.floor(days / 365), "year");
}

/**
 * Riprova sociale reale in home: le ultime 6 recensioni pubbliche da 3
 * stelle in su, con un testo e di professionisti non in pausa
 * (GET /reviews/recent). Sotto il titolo la media vera di tutte le
 * recensioni, da 10 in su (`summary`, da GET /stats/platform). Mai una recensione inventata: se non ce ne
 * sono, la sezione non compare.
 *
 * "Recensione in primo piano" (idea B scelta dall'utente, docs/CHANGELOG.md
 * §229): una recensione grande che cambia da sola ogni 6 secondi e, da
 * computer, l'elenco delle altre a destra da scegliere col clic. Sostituisce
 * la striscia che scorreva da sola: niente più scorrimento orizzontale,
 * quindi niente più spostamenti con la rotellina del mouse.
 *
 * Il giro automatico si ferma con il mouse o il focus della tastiera sulla
 * sezione e non parte con `prefers-reduced-motion`. Quando riparte,
 * ricomincia da capo i 6 secondi della recensione mostrata (`cycle`), così
 * la barra di avanzamento e il timer restano allineati.
 */
export function RecentReviews({ summary }: { summary: { count: number; average: number } | null }) {
  const [reviews, setReviews] = useState<RecentReview[] | null>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    apiClient
      .getRecentReviews()
      // Anche il server le esclude: qui resta solo il controllo sugli spazi.
      .then((items) => setReviews(items.filter((item) => item.comment?.trim())))
      .catch(() => setReviews([]));
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const count = reviews?.length ?? 0;
  const rotating = count > 1 && !paused && !reducedMotion;

  useEffect(() => {
    if (!rotating) return undefined;
    const timeout = setTimeout(() => setActive((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(timeout);
  }, [rotating, active, cycle, count]);

  if (!reviews || reviews.length === 0) return null;

  const review = reviews[Math.min(active, reviews.length - 1)];
  if (!review) return null;
  const profileHref = `/professionista/${review.professional.id}`;
  const accent = accentFor(review.professional.categorySlug);

  function select(index: number) {
    setActive(index);
    setCycle((c) => c + 1);
  }

  // Da telefono si cambia recensione scorrendo col dito (docs/CHANGELOG.md
  // §229): solo un gesto più orizzontale che verticale, così lo scorrimento
  // della pagina resta com'è.
  function onTouchStart(e: TouchEvent) {
    const touch = e.touches[0];
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  function onTouchEnd(e: TouchEvent) {
    const start = touchStartRef.current;
    const touch = e.changedTouches[0];
    touchStartRef.current = null;
    if (!start || !touch || count < 2) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) <= Math.abs(dy)) return;
    select((active + (dx < 0 ? 1 : -1) + count) % count);
  }

  function pause() {
    setPaused(true);
  }

  function resume() {
    setPaused(false);
    setCycle((c) => c + 1);
  }

  return (
    <Section
      eyebrow="Recensioni verificate"
      title="Chi ha già trovato il professionista giusto"
      lead={
        summary && summary.count >= MIN_REVIEWS_FOR_AVERAGE
          ? `★ ${summary.average.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} su 5 · ${summary.count} recensioni, solo di lavori confermati`
          : undefined
      }
      maxWidth={1160}
    >
      <div
        ref={rootRef}
        role="group"
        aria-label="Recensioni dei clienti"
        className={`rr-b${count > 1 ? " rr-b--list" : ""}`}
        onMouseEnter={pause}
        onMouseLeave={resume}
        onFocus={pause}
        onBlur={(e) => {
          if (!rootRef.current?.contains(e.relatedTarget as Node | null)) resume();
        }}
      >
        <article
          key={`${review.id}-${active}`}
          className="rr-feature"
          aria-live={rotating ? "off" : "polite"}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <Link href={profileHref} className="rr-feature-photo" aria-label={review.professional.businessName} style={{ backgroundColor: accent.bg }}>
            {review.professional.imageUrl ? (
              <Image src={review.professional.imageUrl} alt="" fill sizes="(min-width: 700px) 220px, 100vw" style={{ objectFit: "cover" }} />
            ) : (
              <span className="rr-feature-icon">
                <CategoryIcon slug={review.professional.categorySlug} size={52} color={accent.fg} />
              </span>
            )}
          </Link>

          <div className="rr-feature-body">
            <Rating value={review.rating} size={18} />
            <p className="rr-quote">&ldquo;{review.comment ?? ""}&rdquo;</p>
            <XStack alignItems="center" gap="$2" flexWrap="wrap">
              <Text fontSize={14} color={brand.grafite70}>
                {review.clientName} · {timeAgo(review.createdAt)}
              </Text>
              <XStack alignItems="center" gap={3}>
                <Icon name="badge-check" size={13} color={brand.verificato} strokeWidth={2} />
                <Text fontSize={12} fontWeight="700" color={brand.verificato}>
                  Lavoro confermato
                </Text>
              </XStack>
            </XStack>

            <div className="rr-feature-foot">
              <YStack minWidth={0} flexShrink={1}>
                <Text fontFamily="$heading" fontSize={17} fontWeight="700" color={brand.cianografiaScuro} numberOfLines={1}>
                  {review.professional.businessName}
                </Text>
                <Text fontSize={13} color={brand.grafite70} numberOfLines={1}>
                  {review.professional.categoryLabel} · {review.professional.city}
                </Text>
              </YStack>
              <Link href={profileHref} className="rr-cta">
                Vedi profilo
              </Link>
            </div>

            {count > 1 ? (
              <div className="rr-progress" aria-hidden="true">
                <span key={`${active}-${cycle}`} className={`rr-progress-bar${rotating ? "" : " rr-progress-bar--still"}`} />
              </div>
            ) : null}
          </div>
        </article>

        {count > 1 ? (
          <>
            <ul className="rr-list" aria-label="Altre recensioni">
              {reviews.map((item, index) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`rr-item${index === active ? " rr-item--active" : ""}`}
                    aria-pressed={index === active}
                    onClick={() => select(index)}
                  >
                    <ReviewAvatar review={item} />
                    <span className="rr-item-text">
                      <Text fontSize={14} fontWeight="700" color={brand.grafite} numberOfLines={1}>
                        {item.professional.businessName}
                      </Text>
                      <Text fontSize={12.5} color={brand.grafite70} numberOfLines={1}>
                        &ldquo;{item.comment ?? ""}&rdquo;
                      </Text>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            <div className="rr-dots">
              {reviews.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={`rr-dot${index === active ? " rr-dot--active" : ""}`}
                  aria-label={`Recensione ${index + 1} di ${count}`}
                  aria-pressed={index === active}
                  onClick={() => select(index)}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <style jsx>{`
        .rr-b {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 16px;
          width: 100%;
        }
        @media (min-width: 900px) {
          .rr-b--list {
            grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
            gap: 20px;
          }
        }
        .rr-feature {
          display: flex;
          flex-direction: column;
          background: ${brand.calce};
          border-radius: 28px;
          overflow: hidden;
          min-width: 0;
          animation: rr-fade 420ms ease both;
          /* Lo scorrimento orizzontale col dito lo gestiamo noi (cambio di
             recensione): senza, il browser lo usa per "indietro". */
          touch-action: pan-y;
        }
        @media (min-width: 700px) {
          .rr-feature {
            flex-direction: row;
            min-height: 300px;
          }
        }
        @keyframes rr-fade {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        .rr-b :global(.rr-feature-photo) {
          position: relative;
          display: block;
          flex-shrink: 0;
          height: 120px;
          overflow: hidden;
        }
        @media (min-width: 700px) {
          .rr-b :global(.rr-feature-photo) {
            width: 220px;
            height: auto;
          }
        }
        .rr-feature-icon {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .rr-feature-body {
          display: flex;
          flex-direction: column;
          gap: 14px;
          flex: 1;
          min-width: 0;
          padding: 24px;
        }
        @media (min-width: 700px) {
          .rr-feature-body {
            padding: 30px 34px;
          }
        }
        .rr-quote {
          margin: 0;
          font-size: 19px;
          line-height: 1.45;
          font-weight: 600;
          color: ${brand.grafite};
          display: -webkit-box;
          -webkit-line-clamp: 5;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        @media (min-width: 700px) {
          .rr-quote {
            font-size: 22px;
          }
        }
        .rr-feature-foot {
          margin-top: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .rr-b :global(.rr-cta) {
          flex-shrink: 0;
          background: ${brand.cianografia};
          color: ${brand.calce};
          font-weight: 700;
          font-size: 14px;
          padding: 10px 18px;
          border-radius: 999px;
          text-decoration: none;
        }
        .rr-progress {
          height: 4px;
          border-radius: 2px;
          background: ${brand.filetto};
          overflow: hidden;
        }
        .rr-progress-bar {
          display: block;
          height: 100%;
          background: ${brand.cianografia};
          transform-origin: left center;
          animation: rr-progress ${ROTATE_MS}ms linear both;
        }
        .rr-progress-bar--still {
          animation: none;
          transform: scaleX(0);
        }
        @keyframes rr-progress {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }
        .rr-list {
          display: none;
          list-style: none;
          margin: 0;
          padding: 0;
          flex-direction: column;
          gap: 8px;
        }
        .rr-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          text-align: left;
          padding: 9px 12px;
          border: none;
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.55);
          cursor: pointer;
          font: inherit;
          transition: background-color 160ms ease, box-shadow 160ms ease;
        }
        .rr-item:hover {
          background: ${brand.calce};
        }
        .rr-item--active {
          background: ${brand.calce};
          box-shadow: inset 0 0 0 2px ${brand.cianografia};
        }
        .rr-item-text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .rr-dots {
          display: flex;
          justify-content: center;
          gap: 2px;
        }
        @media (min-width: 900px) {
          .rr-list {
            display: flex;
          }
          .rr-dots {
            display: none;
          }
        }
        .rr-dot {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
        }
        .rr-dot::after {
          content: "";
          width: 8px;
          height: 8px;
          border-radius: 4px;
          background: #e6cfb2;
          transition: width 200ms ease, background-color 200ms ease;
        }
        .rr-dot--active::after {
          width: 22px;
          background: ${brand.cianografia};
        }
      `}</style>
    </Section>
  );
}

function ReviewAvatar({ review }: { review: RecentReview }) {
  if (review.professional.imageUrl) {
    return <Avatar name={review.professional.businessName} imageUrl={review.professional.imageUrl} size={40} />;
  }
  const accent = accentFor(review.professional.categorySlug);
  return (
    <YStack width={40} height={40} borderRadius={20} flexShrink={0} alignItems="center" justifyContent="center" backgroundColor={accent.bg}>
      <CategoryIcon slug={review.professional.categorySlug} size={20} color={accent.fg} />
    </YStack>
  );
}
