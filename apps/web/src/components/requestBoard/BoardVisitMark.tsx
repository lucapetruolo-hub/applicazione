"use client";

import { useEffect } from "react";
import { markBoardVisit } from "@/lib/siteCounts";

/**
 * Segna nella scheda del browser che la visita è passata da "Lavori cercati":
 * se poi la persona si iscrive come professionista, l'account lo ricorda
 * (docs/changelog/2026-11-20-misure-lavori-cercati.md). Non disegna niente.
 */
export function BoardVisitMark() {
  useEffect(() => {
    markBoardVisit();
  }, []);
  return null;
}
