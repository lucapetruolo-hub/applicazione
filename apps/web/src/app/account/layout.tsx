import type { Metadata } from "next";
import { BRAND } from "@professionisti/shared";
import { AccountShell } from "@/components/account/AccountShell";

/** Titolo della scheda del browser (E7-01 del controllo dell'8/11). */
// `absolute` + `template`: le pagine qui dentro hanno il nome del sito in coda come le altre.
export const metadata: Metadata = { title: { absolute: `Account | ${BRAND.name}`, template: `%s | ${BRAND.name}` } };

/** Menu delle pagine personali (docs/CHANGELOG.md §147). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
