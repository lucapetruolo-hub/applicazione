import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";

// Titolo della scheda del browser (le pagine sono client) e fuori da Google.
export const metadata: Metadata = {
  title: "Il tuo account",
  // Pagina personale o aperta da un link nelle email: mai in Google, anche
  // dopo il lancio (collaudo 08/11 E8-07).
  robots: { index: false, follow: false },
};

/** Menu delle pagine personali (docs/CHANGELOG.md §147). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
