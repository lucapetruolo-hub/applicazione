import type { Metadata } from "next";
import Link from "next/link";
import {
  OUT_OF_SERVICE_LABELS,
  PROFESSIONAL_CATEGORIES,
  WAITING_TRADE_KEYS,
  type BoardSummaryRow,
} from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { breadcrumbJsonLd } from "@/lib/jsonLd";
import { JsonLd } from "@/components/JsonLd";
import boardStyles from "@/components/requestBoard/BoardPage.module.css";
import { BoardWeeklySwitch } from "@/components/requestBoard/BoardWeeklySwitch";

/**
 * "Lavori cercati": tutti i mestieri della bacheca in una pagina, anche gli 8
 * che il sito non ha ancora tra le categorie, con quante richieste aspettano
 * (scelta di Luca del 19/11/2026, docs/changelog/2026-11-19-pagina-lavori-cercati.md).
 * Si apre dal piede del sito, da "Offri i tuoi servizi" e dal menu del
 * professionista.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Lavori cercati: clienti che aspettano un preventivo",
  description:
    "Le richieste dei clienti che aspettano ancora un preventivo, divise per mestiere e provincia. Guardale anche prima di iscriverti.",
  alternates: { canonical: "/lavora-con-noi" },
};

async function countsByTrade(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const { rows } = await apiClient.getRequestBoardSummary();
    for (const row of rows as BoardSummaryRow[]) counts.set(row.trade, (counts.get(row.trade) ?? 0) + row.count);
  } catch {
    // Senza numeri la pagina resta utile: i mestieri si aprono lo stesso.
  }
  return counts;
}

function TradeList({ trades, counts, label }: { trades: { slug: string; label: string }[]; counts: Map<string, number>; label: string }) {
  return (
    <ul className={boardStyles.provinces} aria-label={label}>
      {trades.map((trade) => {
        const count = counts.get(trade.slug) ?? 0;
        return (
          <li key={trade.slug}>
            <Link className={boardStyles.chip} href={`/lavora-con-noi/${trade.slug}`}>
              {count > 0 ? `${trade.label} · ${count}` : trade.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default async function BoardIndexPage() {
  const counts = await countsByTrade();
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const categories = PROFESSIONAL_CATEGORIES.map((category) => ({ slug: category.slug, label: category.label }));
  const waiting = WAITING_TRADE_KEYS.map((key) => ({ slug: key, label: OUT_OF_SERVICE_LABELS[key] }));
  const breadcrumbs = breadcrumbJsonLd([
    { label: "Home", href: "/" },
    { label: "Per i professionisti", href: "/per-professionisti" },
    { label: "Lavori cercati" },
  ]);

  return (
    <div className="price-page">
      <JsonLd data={breadcrumbs} />
      <h1 className="price-page-title">Lavori cercati</h1>
      <p className="price-page-lead">
        {total > 0
          ? `${total === 1 ? "Un cliente aspetta" : `${total} clienti aspettano`} ancora un preventivo. Scegli il tuo mestiere per vedere le richieste, senza nome né indirizzo.`
          : "Qui trovi i clienti che aspettano ancora un preventivo, senza nome né indirizzo. Scegli il tuo mestiere per vedere le richieste."}
      </p>
      <BoardWeeklySwitch />
      <section aria-labelledby="mestieri-sito">
        <h2 id="mestieri-sito" className={boardStyles.boxTitle}>
          Mestieri
        </h2>
        <TradeList trades={categories} counts={counts} label="Mestieri" />
      </section>
      <section aria-labelledby="mestieri-mancanti">
        <h2 id="mestieri-mancanti" className={boardStyles.boxTitle}>
          Lavori che nessuno fa ancora sul sito
        </h2>
        <p className={boardStyles.boxText}>I clienti li hanno chiesti e aspettano: se fai uno di questi lavori, le richieste ti arrivano appena ti iscrivi.</p>
        <TradeList trades={waiting} counts={counts} label="Lavori che nessuno fa ancora sul sito" />
      </section>
      <div className="price-page-actions">
        <Link className="price-page-cta" href="/registrati?ruolo=professionista">
          Iscriviti come professionista
        </Link>
        <Link className="price-page-link" href="/per-professionisti">
          Prezzi e condizioni
        </Link>
      </div>
    </div>
  );
}
