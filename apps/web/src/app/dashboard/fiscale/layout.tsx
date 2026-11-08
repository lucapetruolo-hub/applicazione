import type { Metadata } from "next";
import { BRAND } from "@professionisti/shared";

/** Titolo della scheda del browser (E7-01 del controllo dell'8/11): le pagine sono client, il titolo sta qui. */
// `absolute` + `template`: le pagine qui dentro hanno il nome del sito in coda come le altre.
export const metadata: Metadata = { title: { absolute: `Fisco e pagamenti | ${BRAND.name}`, template: `%s | ${BRAND.name}` } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
