"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { countPriceToolEntry } from "@/lib/siteCounts";

/** Link di una riga della tabella "Prezzi dei lavori più comuni", contato come voce di "Quanto costa" (§389). */
export function PriceToolLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link className="price-table-link" href={href} aria-label={label} onClick={countPriceToolEntry}>
      {children}
    </Link>
  );
}
