import type { Metadata } from "next";
import { AccountShell } from "@/components/account/AccountShell";

/** Titolo della scheda del browser (E7-01 del controllo dell'8/11). */
export const metadata: Metadata = { title: "Oggi" };

/** Menu delle pagine personali (docs/CHANGELOG.md §147). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AccountShell>{children}</AccountShell>;
}
