import Link from "next/link";
import { BOARD_MAX_QUOTES, isProfessionalCategorySlug, type BoardCard } from "@professionisti/shared";
import { CategoryIcon } from "@/components/icons/CategoryIcons";
import styles from "./BoardCards.module.css";

/**
 * Schede della bacheca "Lavori cercati" (docs/changelog/2026-11-17-bacheca-lavori-cercati.md):
 * titolo e riassunto senza dati personali, luogo, tempi, quante foto (mai le
 * foto), posti per i preventivi e "Rispondi": chi ha già l'account da
 * professionista prende la richiesta, gli altri si iscrivono con il mestiere
 * già scelto (docs/changelog/2026-11-17-bacheca-rispondi.md).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function arrivedLabel(listedAt: string, now: number): { text: string; fresh: boolean } {
  const days = Math.max(0, Math.floor((now - new Date(listedAt).getTime()) / DAY_MS));
  if (days === 0) return { text: "Arrivata oggi", fresh: true };
  if (days === 1) return { text: "Arrivata ieri", fresh: true };
  return { text: `Arrivata ${days} giorni fa`, fresh: days <= 2 };
}

function slotsLabel(count: number): string {
  if (count === 0) return "Nessun preventivo";
  return `${count} ${count === 1 ? "preventivo" : "preventivi"} su ${BOARD_MAX_QUOTES}`;
}

function photosLabel(count: number): string | null {
  if (count === 0) return null;
  return count === 1 ? "1 foto · la vedi dopo l'iscrizione" : `${count} foto · le vedi dopo l'iscrizione`;
}

export function replyHref(card: BoardCard): string {
  const params = new URLSearchParams({ richiesta: card.id });
  if (isProfessionalCategorySlug(card.trade)) params.set("categoria", card.trade);
  return `/rispondi?${params.toString()}`;
}

export function BoardCards({ cards, now }: { cards: BoardCard[]; now: number }) {
  return (
    <ul className={styles.list}>
      {cards.map((card) => {
        const arrived = arrivedLabel(card.listedAt, now);
        const photos = photosLabel(card.photoCount);
        return (
          <li key={card.id} className={styles.card}>
            <div className={styles.head}>
              <span className={styles.icon} aria-hidden="true">
                {isProfessionalCategorySlug(card.trade) ? (
                  <CategoryIcon slug={card.trade} size={22} />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />
                  </svg>
                )}
              </span>
              <div>
                <h3 className={styles.title}>{card.title}</h3>
                <div className={styles.meta}>
                  {card.tradeLabel} · {card.place}
                  {card.serviceMode === "ONLINE" ? " · Online" : card.serviceMode === "HOME" ? " · A domicilio" : ""}
                </div>
              </div>
            </div>
            <p className={styles.summary}>{card.summary}</p>
            <ul className={styles.facts}>
              <li className={`${styles.fact} ${arrived.fresh ? styles.fresh : ""}`}>{arrived.text}</li>
              {card.timing ? <li className={styles.fact}>{card.timing}</li> : null}
              {photos ? <li className={styles.fact}>{photos}</li> : null}
            </ul>
            <div className={styles.foot}>
              <span className={styles.slots}>
                <span className={styles.dots} aria-hidden="true">
                  {Array.from({ length: BOARD_MAX_QUOTES }, (_, index) => (
                    <i key={index} className={`${styles.dot} ${index < card.quoteCount ? styles.dotFull : ""}`} />
                  ))}
                </span>
                {slotsLabel(card.quoteCount)}
              </span>
              <Link className={styles.cta} href={replyHref(card)} aria-label={`Rispondi: ${card.title}`}>
                Rispondi
              </Link>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
