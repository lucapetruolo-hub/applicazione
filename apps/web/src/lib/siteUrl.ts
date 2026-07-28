/**
 * Unica fonte di verità per l'URL assoluto del sito (Fase 6): prima era
 * ripetuto come stringa hardcoded solo in `layout.tsx` (`metadataBase`),
 * serve anche a `robots.ts`/`sitemap.ts`/ai dati strutturati JSON-LD, che
 * hanno tutti bisogno dello stesso dominio assoluto.
 */
export const SITE_URL = "https://applicazione-web.vercel.app";
