import { ApiError } from "@professionisti/api-client";
import { BRAND, personalLinkBadgeSvg, personalLinkBadgeTheme } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";

/**
 * Bollino con le stelle per il sito del professionista
 * (docs/changelog/2026-11-09-passaparola.md): un'immagine SVG con il voto
 * medio e il numero delle recensioni, che il professionista mette sul suo
 * sito dentro il link personale. Nessuno script e nessun cookie: chi visita
 * il suo sito scarica solo questa immagine dal nostro, rifatta al massimo
 * ogni ora.
 */
// Sempre dal server, il CDN di Vercel lo tiene un'ora (Cache-Control qui sotto).
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ code: string }> }) {
  const { code } = await context.params;
  let pro: { rating: number | null; reviewCount: number };
  try {
    pro = await apiClient.resolvePersonalLink(code);
  } catch (err) {
    const status = err instanceof ApiError && (err.status === 404 || err.status === 400) ? 404 : 503;
    return new Response(null, { status, headers: { "Cache-Control": "public, max-age=300" } });
  }
  // `?tema=scuro` per i siti a sfondo scuro; ogni altro valore dà il bollino chiaro.
  const theme = personalLinkBadgeTheme(new URL(request.url).searchParams.get("tema"));
  return new Response(personalLinkBadgeSvg({ rating: pro.rating, reviewCount: pro.reviewCount, siteName: BRAND.name, theme }), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      // Un'ora sul CDN e nel browser: il voto cambia solo con una recensione nuova.
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      // L'SVG non deve mai eseguire nulla, anche se aperto da solo.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
