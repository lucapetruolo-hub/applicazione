import type { Metadata } from "next";
import { Suspense } from "react";
import { ExcelGratuitoContent } from "./ExcelGratuitoContent";
import { openGraphFor } from "@/lib/openGraph";

export const metadata: Metadata = {
  title: "Excel gratuito entrate e uscite per artigiani",
  description: "Scarica gratis il foglio Excel per segnare entrate e spese del tuo lavoro: totali del mese, quanto ti resta e stima del forfettario. Da dare al tuo commercialista.",
  alternates: { canonical: "/per-professionisti/excel-gratuito" },
  openGraph: openGraphFor("/per-professionisti/excel-gratuito"),
};

export default function ExcelGratuitoPage() {
  return (
    <Suspense>
      <ExcelGratuitoContent />
    </Suspense>
  );
}
