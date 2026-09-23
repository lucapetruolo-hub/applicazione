import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";
import { SITE_INDEXABLE } from "@/lib/siteIndexing";

/**
 * Fase 6 (SEO): esclude dalla scansione le pagine che non hanno valore come
 * contenuto indicizzabile — form di autenticazione, aree account/dashboard
 * dietro login, pannello admin. Nessuna di queste può usare `noindex` via
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
        "/account",
        "/le-mie-richieste",
        "/professionisti-salvati",
        "/chat",
        "/dashboard",
        "/dashboard/*",
        "/admin",
        "/admin/*",
      ],
    },
    // Sito privato (lib/siteIndexing.ts): scansione ancora permessa, così i
    // crawler leggono il `noindex` e tolgono le pagine già indicizzate, ma
    // nessuna sitemap da proporre.
    ...(SITE_INDEXABLE ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
  };
}
