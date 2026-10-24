import Link from "next/link";
import { breadcrumbJsonLd, jsonForScript, type BreadcrumbItem } from "@/lib/jsonLd";

/**
 * Percorso "Home › Idraulico › Latina › Nome" (docs/CHANGELOG.md §295): per
 * chi legge, un modo per risalire alla categoria e alla città; per Google, i
 * dati strutturati BreadcrumbList nello stesso HTML. L'ultima voce è la
 * pagina corrente (senza link) e si accorcia con i puntini se non ci sta.
 */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(breadcrumbJsonLd(items)) }} />
      <nav aria-label="Percorso" className="breadcrumbs">
        <ol className="breadcrumbs-list">
          {items.map((item, index) => (
            <li key={`${index}-${item.label}`} className="breadcrumbs-item">
              {index > 0 ? (
                <span className="breadcrumbs-sep" aria-hidden="true">
                  ›
                </span>
              ) : null}
              {item.href ? (
                <Link href={item.href} className="breadcrumbs-link">
                  {item.label}
                </Link>
              ) : (
                <span className="breadcrumbs-current" aria-current="page">
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
