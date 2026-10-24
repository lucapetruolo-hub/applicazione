import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";
import { SITE_INDEXABLE } from "@/lib/siteIndexing";

/**
 * Fase 6 (SEO): esclude dalla scansione le pagine che non hanno valore come
 * contenuto indicizzabile — form di autenticazione, aree account/dashboard
 * dietro login. Nessuna di queste può usare `noindex` via
 * `<meta>` perché sono tutte pagine client (`"use client"` nel file stesso,
 * non un server component con `generateMetadata`) — `robots.txt` è il modo
 * corretto per tenerle fuori dall'indice senza dover riscrivere la
 * struttura di ogni pagina solo per questo.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/accedi",
        "/registrati",
        "/password-dimenticata",
        "/reimposta-password",
        "/account",
        "/le-mie-richieste",
        "/professionisti-salvati",
        "/le-mie-recensioni",
        "/chat",
        "/dashboard",
        "/dashboard/*",
        // L'area admin non si nomina qui: robots.txt è pubblico e lo
        // leggerebbe anche chi la cerca (controllo sicurezza, docs/CHANGELOG.md
        // §292). Senza il link d'ingresso risponde "pagina non trovata".
      ],
    },
    // Sito privato (lib/siteIndexing.ts): scansione ancora permessa, così i
    // crawler leggono il `noindex` e tolgono le pagine già indicizzate, ma
    // nessuna sitemap da proporre.
    ...(SITE_INDEXABLE ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
  };
}
