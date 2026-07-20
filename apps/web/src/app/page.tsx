"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { PROFESSIONAL_CATEGORIES } from "@professionisti/shared";
import { Button } from "@professionisti/ui";

export default function HomePage() {
  const router = useRouter();

  return (
    <main>
      <h1>Trova un professionista vicino a te</h1>
      <p>Idraulico, elettricista, imbianchino e altri servizi verificati nella tua città.</p>

      <Button onPress={() => router.push("/cerca/idraulico")}>Cerca un idraulico</Button>

      <section aria-label="Categorie">
        <ul>
          {PROFESSIONAL_CATEGORIES.map((category) => (
            <li key={category.slug}>
              <Link href={`/cerca/${category.slug}`}>{category.label}</Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
