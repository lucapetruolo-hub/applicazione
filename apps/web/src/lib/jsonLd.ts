import { SITE_URL } from "@/lib/siteUrl";

/**
 * JSON dentro un `<script>`: `<` diventa `<`, così un nome attività con
 * "</script>" non chiude lo script e non inserisce HTML nella pagina (XSS,
 * docs/CHANGELOG.md §283). Il JSON resta identico per chi lo legge.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** Una voce del percorso: senza `href` è la pagina corrente. */
export type BreadcrumbItem = { label: string; href?: string };

/**
 * Dati strutturati BreadcrumbList (schema.org): Google mostra il percorso
 * ("Home › Idraulico › Latina") nel risultato al posto dell'indirizzo.
 */
export function breadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.label,
      ...(item.href ? { item: `${SITE_URL}${item.href === "/" ? "" : item.href}` } : {}),
    })),
  };
}
