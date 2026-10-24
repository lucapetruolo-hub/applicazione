import { jsonForScript } from "@/lib/jsonLd";

/**
 * Dati strutturati per Google in un `<script type="application/ld+json">`:
 * unico punto che scrive HTML grezzo, sempre passando da `jsonForScript`
 * (un "</script>" nei dati non chiude lo script, docs/CHANGELOG.md §283, §304).
 */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonForScript(data) }} />;
}
