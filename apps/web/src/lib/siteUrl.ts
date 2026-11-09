/**
 * Unica fonte di verità per l'URL assoluto del sito (Fase 6): serve a
 * `metadataBase`, `robots.ts`/`sitemap.ts`, canonical e dati strutturati
 * JSON-LD, che hanno tutti bisogno dello stesso dominio assoluto.
 *
 * Il dominio definitivo si imposta su Vercel con `NEXT_PUBLIC_SITE_URL`
 * (es. `https://www.nomedelsito.it`) e un nuovo deploy: il giorno del lancio
 * non serve modificare il codice (collaudo 08/11 E8-09,
 * docs/changelog/2026-11-08-seo-e-velocita.md). Senza variabile resta
 * l'indirizzo di Vercel. La barra finale si toglie: i canonical si
 * costruiscono come `${SITE_URL}/percorso`.
 */
const DEFAULT_SITE_URL = "https://applicazione-web.vercel.app";

function normalizeSiteUrl(value: string | undefined): string {
  const trimmed = value?.trim().replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_SITE_URL;
  try {
    const url = new URL(trimmed);
    // Solo un'origine https (o http per le prove in locale), senza percorso:
    // un valore scritto male non deve finire nei canonical di tutto il sito.
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.pathname !== "/" || url.search || url.hash) {
      return DEFAULT_SITE_URL;
    }
    return url.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export const SITE_URL = normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL);
