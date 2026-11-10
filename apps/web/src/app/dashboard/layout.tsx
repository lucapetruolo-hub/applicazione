import type { Metadata } from "next";
import { BRAND } from "@professionisti/shared";
import { AccountShell } from "@/components/account/AccountShell";
import { PersonalLinkNudgeHost } from "@/components/PersonalLinkNudge";

// Titolo della scheda del browser (E7-01 del controllo dell'8/11) e fuori da Google.
// `absolute` + `template`: le pagine qui dentro hanno il nome del sito in coda come le altre.
export const metadata: Metadata = {
  title: { absolute: `Oggi | ${BRAND.name}`, template: `%s | ${BRAND.name}` },
  // Pagina personale o aperta da un link nelle email: mai in Google, anche
  // dopo il lancio (collaudo 08/11 E8-07).
  robots: { index: false, follow: false },
};

/** Menu delle pagine personali (docs/CHANGELOG.md §147). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AccountShell>
      {children}
      {/* Invito a mandare il link personale dopo "Lavoro terminato" (docs/changelog/2026-11-08-canale-del-professionista.md). */}
      <PersonalLinkNudgeHost />
    </AccountShell>
  );
}
