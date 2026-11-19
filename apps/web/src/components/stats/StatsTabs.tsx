"use client";

import Link from "next/link";

/**
 * Le due schede di Statistiche (docs/changelog/2026-11-19-entrate-e-uscite.md):
 * l'andamento del lavoro e i soldi entrati e usciti. Collegamenti tra pagine,
 * con lo stesso aspetto delle schede di "Fisco e pagamenti".
 */
const TABS = [
  { key: "andamento", href: "/dashboard/statistiche", label: "Andamento" },
  { key: "entrate-uscite", href: "/dashboard/statistiche/entrate-uscite", label: "Entrate e uscite" },
] as const;

export function StatsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <nav className="fisco-tabs stats-tabs" aria-label="Sezioni di Statistiche">
      {TABS.map((tab) => (
        <Link key={tab.key} href={tab.href} className={`fisco-tab${tab.key === active ? " is-active" : ""}`} aria-current={tab.key === active ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
