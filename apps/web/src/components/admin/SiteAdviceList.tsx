"use client";

import Link from "next/link";
import { SITE_ADVICE_LEVEL_LABEL, type SiteAdvice } from "@professionisti/shared";
import { SITE_INDEXABLE } from "@/lib/siteIndexing";

/**
 * "Cosa fare questa settimana" (docs/CHANGELOG.md §372, richiesta di Luca):
 * i consigli già decisi dai numeri, scritti per chi non vuole leggere le
 * tabelle. Ogni scheda dice cosa fare, perché in una riga e dove farlo.
 */
export function visibleAdvice(advice: SiteAdvice[]): SiteAdvice[] {
  // Il sito è già aperto a Google: il consiglio di aprirlo non serve più.
  return SITE_INDEXABLE ? advice.filter((a) => a.key !== "google-ready") : advice;
}

export function SiteAdviceList({ advice, limit }: { advice: SiteAdvice[]; limit?: number }) {
  const shown = visibleAdvice(advice);
  const list = limit ? shown.slice(0, limit) : shown;
  if (list.length === 0) {
    return (
      <div className="site-advice-empty">
        <strong>Questa settimana non c&apos;è niente da cambiare.</strong>
        <span>I numeri vanno bene o sono ancora troppo pochi per dire qualcosa. Lunedì prossimo ricontrolliamo da soli.</span>
      </div>
    );
  }
  return (
    <ol className="site-advice-list">
      {list.map((item) => (
        <li key={item.key} className={`site-advice is-${item.level.toLowerCase()}`}>
          <span className="site-advice-level">{SITE_ADVICE_LEVEL_LABEL[item.level]}</span>
          <h3 className="site-advice-title">{item.title}</h3>
          <p className="site-advice-todo">{item.todo}</p>
          <p className="site-advice-why">
            <span>Perché: </span>
            {item.why}
          </p>
          {item.items?.length ? (
            <ul className="site-advice-items">
              {item.items.map((entry) => (
                <li key={`${entry.label}-${entry.detail ?? ""}`}>
                  {entry.href ? <Link href={entry.href}>{entry.label}</Link> : <strong>{entry.label}</strong>}
                  {entry.detail ? <span> · {entry.detail}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {item.link ? (
            <Link href={item.link.href} className="admin-link-button site-advice-action">
              {item.link.label}
            </Link>
          ) : null}
        </li>
      ))}
      {limit && shown.length > limit ? (
        <li className="site-advice-more">
          <Link href="/admin/andamento">
            Altri {shown.length - limit} {shown.length - limit === 1 ? "consiglio" : "consigli"} in Andamento del sito
          </Link>
        </li>
      ) : null}
    </ol>
  );
}
