import { AccountShell } from "@/components/account/AccountShell";
import { PersonalLinkNudgeHost } from "@/components/PersonalLinkNudge";

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
