import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  PROVINCE_NAMES,
  boardTradeLabel,
  isBoardTrade,
  isProfessionalCategorySlug,
  provinceFromSlug,
  provinceSlug,
  type BoardPage,
  type BoardSummary,
} from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { breadcrumbJsonLd } from "@/lib/jsonLd";
import { JsonLd } from "@/components/JsonLd";
import { BoardCards } from "@/components/requestBoard/BoardCards";
import { BoardAlertForm } from "@/components/requestBoard/BoardAlertForm";
import styles from "@/components/requestBoard/BoardPage.module.css";
import { BoardWeeklySwitch } from "@/components/requestBoard/BoardWeeklySwitch";
import { BoardVisitMark } from "@/components/requestBoard/BoardVisitMark";

/**
 * Bacheca "Lavori cercati" per mestiere e provincia
 * (docs/changelog/2026-11-17-bacheca-lavori-cercati.md, decisioni di Luca del
 * 17/11/2026): chiunque vede le richieste rimaste senza risposta, anonime;
 * per rispondere ci si iscrive. Sempre aggiornata (una richiesta ritirata
 * non deve restare visibile) e su Google solo con almeno una scheda.
 */
export const dynamic = "force-dynamic";

type PageParams = { categoria: string; provincia: string };
type SearchParams = { pagina?: string };

function pageNumber(raw: string | undefined): number {
  const page = Number(raw ?? 1);
  return Number.isInteger(page) && page >= 1 && page <= 50 ? page : 1;
}

async function loadBoard(trade: string, province: string, page: number): Promise<BoardPage | null> {
  try {
    return await apiClient.getRequestBoard(trade, province, page);
  } catch {
    return null;
  }
}

async function loadSummary(): Promise<BoardSummary> {
  try {
    return await apiClient.getRequestBoardSummary();
  } catch {
    return { rows: [] };
  }
}

/** Ora della pagina, una volta sola: "Arrivata 2 giorni fa" uguale in tutte le schede. */
function pageTime(): number {
  return Date.now();
}

function resolve(params: PageParams) {
  const province = provinceFromSlug(params.provincia);
  if (!isBoardTrade(params.categoria) || !province) return null;
  return { trade: params.categoria, province, provinceName: PROVINCE_NAMES[province]!, label: boardTradeLabel(params.categoria) };
}

export async function generateMetadata(props: { params: Promise<PageParams>; searchParams: Promise<SearchParams> }): Promise<Metadata> {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const found = resolve(params);
  if (!found) return {};
  const page = pageNumber(searchParams.pagina);
  const board = await loadBoard(found.trade, found.province, page);
  const title = `Lavori cercati: ${found.label.toLowerCase()} in provincia di ${found.provinceName}`;
  return {
    title,
    description: `Clienti in provincia di ${found.provinceName} che aspettano un preventivo da ${found.label.toLowerCase()}. Scegli a chi rispondere: crea il profilo e manda il preventivo dal telefono.`,
    alternates: { canonical: `/lavora-con-noi/${found.trade}/${params.provincia}` },
    // Su Google solo con almeno una scheda (decisione di Luca) e solo la prima pagina.
    ...(!board || board.total === 0 || page > 1 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function BoardProvincePage(props: { params: Promise<PageParams>; searchParams: Promise<SearchParams> }) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams]);
  const found = resolve(params);
  if (!found) notFound();
  const page = pageNumber(searchParams.pagina);
  const [board, summary] = await Promise.all([loadBoard(found.trade, found.province, page), loadSummary()]);
  const cards = board?.cards ?? [];
  const total = board?.total ?? 0;
  const otherTrades = (summary.rows ?? []).filter((row) => row.province === found.province && row.trade !== found.trade);
  const hasMore = board ? page * board.pageSize < total : false;
  const register = `/registrati?ruolo=professionista${isProfessionalCategorySlug(found.trade) ? `&categoria=${found.trade}` : ""}`;
  const label = found.label.toLowerCase();
  const breadcrumbs = breadcrumbJsonLd([
    { label: "Home", href: "/" },
    { label: "Per i professionisti", href: "/per-professionisti" },
    { label: "Lavori cercati", href: "/lavora-con-noi" },
    ...(isProfessionalCategorySlug(found.trade) ? [{ label: found.label, href: `/lavora-con-noi/${found.trade}` }] : []),
    { label: `Provincia di ${found.provinceName}` },
  ]);
  const now = pageTime();

  return (
    <div className={styles.page}>
      <JsonLd data={breadcrumbs} />
      <BoardVisitMark />
      <h1 className={styles.title}>
        Lavori cercati: {label} in provincia di {found.provinceName}
      </h1>
      <p className={styles.lead}>Clienti che aspettano ancora un preventivo. Scegli tu a chi rispondere: per farlo crea il tuo profilo.</p>

      <BoardWeeklySwitch />
      {otherTrades.length > 0 ? (
        <ul className={styles.chips} aria-label="Altri lavori cercati in questa provincia">
          <li>
            <span className={`${styles.chip} ${styles.chipOn}`} aria-current="page">
              {found.label}
            </span>
          </li>
          {otherTrades.map((row) => (
            <li key={row.trade}>
              <Link className={styles.chip} href={`/lavora-con-noi/${row.trade}/${provinceSlug(found.province)}`}>
                {boardTradeLabel(row.trade)}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className={styles.layout}>
        <div>
          {cards.length > 0 ? (
            <>
              <p className={styles.count}>
                {total === 1 ? "1 lavoro in attesa" : `${total} lavori in attesa`} · prima quelli con meno preventivi
              </p>
              <BoardCards cards={cards} now={now} from="pagina" />
              {hasMore ? (
                <Link className={styles.more} href={`/lavora-con-noi/${found.trade}/${params.provincia}?pagina=${page + 1}`}>
                  Altri lavori
                </Link>
              ) : null}
            </>
          ) : board ? (
            <div className={styles.empty}>
              In questo momento nessun cliente in provincia di {found.provinceName} aspetta un {label}. Le richieste nuove della tua zona ti arrivano da sole quando hai il profilo.
              <div className={styles.emptyActions}>
                <Link className={styles.cta} href={register}>
                  Iscriviti: le richieste ti arrivano da sole
                </Link>
              </div>
              <BoardAlertForm trade={found.trade} province={found.province} label={label} provinceName={found.provinceName} />
            </div>
          ) : (
            <p className={styles.empty}>La bacheca non si carica in questo momento. Riprova tra poco.</p>
          )}
          <p className={styles.note}>
            Il nome, i contatti e l&apos;indirizzo del cliente li ricevi solo se accetta il tuo preventivo. Il prezzo lo decidi tu.
          </p>
        </div>

        <aside className={styles.side}>
          <div className={styles.box}>
            <h2 className={styles.boxTitle}>Come si risponde</h2>
            <ol className={styles.steps}>
              <li>Crea il profilo con il tuo lavoro e la tua zona</li>
              <li>Verifica il documento con un selfie</li>
              <li>La richiesta ti arriva nell&apos;elenco: mandi il preventivo dal telefono</li>
            </ol>
            <Link className={styles.cta} href={register}>
              Iscriviti come professionista
            </Link>
          </div>
          <div className={styles.box}>
            <h2 className={styles.boxTitle}>Prezzi e condizioni</h2>
            <p className={styles.boxText}>Un abbonamento al mese, con i primi mesi gratis quando c&apos;è l&apos;offerta. Nessuna commissione sui lavori pagati direttamente.</p>
            <Link className={styles.link} href="/per-professionisti">
              Scopri di più
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
