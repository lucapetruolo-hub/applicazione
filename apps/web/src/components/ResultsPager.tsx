import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pagerItems } from "@professionisti/shared";
import styles from "./ResultsPager.module.css";

/**
 * Pagine numerate sotto le schede (scelta di Luca, docs/changelog/2026-11-16-pagine-da-20.md):
 * link veri (`?pagina=2`) per la ricerca, che Google e il tasto Indietro
 * seguono; pulsanti per la zona della mappa, che vive solo nel browser.
 * HTML semplice, come il resto della pagina dei risultati.
 */
export function ResultsPager({
  page,
  pageCount,
  total,
  pageSize,
  hrefFor,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  hrefFor?: (page: number) => string;
  onPage?: (page: number) => void;
}) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const control = (target: number, content: ReactNode, label: string) => {
    const className = styles.item;
    if (hrefFor) {
      return (
        <Link href={hrefFor(target)} className={className} aria-label={label}>
          {content}
        </Link>
      );
    }
    return (
      <button type="button" className={className} aria-label={label} onClick={() => onPage?.(target)}>
        {content}
      </button>
    );
  };

  return (
    <nav className={styles.pager} aria-label="Pagine dei risultati">
      <ul className={styles.list}>
        {page > 1 ? (
          <li>
            {control(
              page - 1,
              <>
                <ChevronLeft size={18} strokeWidth={2} aria-hidden />
                <span className={styles.label}>Precedente</span>
              </>,
              "Pagina precedente",
            )}
          </li>
        ) : null}
        {pagerItems(page, pageCount).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} className={styles.gap} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              {item === page ? (
                <span className={`${styles.item} ${styles.current}`} aria-current="page">
                  <span className="sr-only">Pagina </span>
                  {item}
                </span>
              ) : (
                control(item, item, `Pagina ${item}`)
              )}
            </li>
          ),
        )}
        {page < pageCount ? (
          <li>
            {control(
              page + 1,
              <>
                <span className={styles.label}>Successiva</span>
                <ChevronRight size={18} strokeWidth={2} aria-hidden />
              </>,
              "Pagina successiva",
            )}
          </li>
        ) : null}
      </ul>
      <span className={styles.summary}>
        Da {first} a {last} di {total} professionisti
      </span>
    </nav>
  );
}
