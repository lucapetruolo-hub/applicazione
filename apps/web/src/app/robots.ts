import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

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
        "/dashboard",
        "/dashboard/*",
        "/admin",
        "/admin/*",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
