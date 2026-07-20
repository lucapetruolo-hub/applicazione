import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  PROFESSIONAL_CATEGORIES,
  isProfessionalCategorySlug,
} from "@professionisti/shared";

type PageParams = { categoria: string };

// SSG: pre-genera una pagina per categoria a build time — pagina SEO-critica,
// non va convertita in client-side rendering (CLAUDE.md §5.4).
export function generateStaticParams() {
  return PROFESSIONAL_CATEGORIES.map((category) => ({ categoria: category.slug }));
}

export function generateMetadata({ params }: { params: PageParams }): Metadata {
  if (!isProfessionalCategorySlug(params.categoria)) {
    return {};
  }
  const category = PROFESSIONAL_CATEGORIES.find((c) => c.slug === params.categoria)!;
  return {
    title: `${category.label} vicino a te`,
    description: `Trova e contatta ${category.label.toLowerCase()} verificati nella tua zona.`,
  };
}

export default function CategoryPage({ params }: { params: PageParams }) {
  if (!isProfessionalCategorySlug(params.categoria)) {
    notFound();
  }
  const category = PROFESSIONAL_CATEGORIES.find((c) => c.slug === params.categoria)!;

  return (
    <main>
      <h1>{category.label} vicino a te</h1>
      <p>Elenco professionisti in arrivo — ricerca per città e disponibilità.</p>
      <ul>
        {category.subTags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
    </main>
  );
}
