"use client";

import type { ReactNode } from "react";
import { Surface, YStack, brand, radiusDocLg } from "@professionisti/ui";

/**
 * Sfondo pesca con due forme sfumate dietro una scheda bianca, nato in
 * /registrati e riusato nelle altre pagine a scheda singola (accesso,
 * recupero password, completamento profilo) su richiesta dell'utente
 * (docs/CHANGELOG.md §177). Le forme vivono in un contenitore assoluto con
 * `overflow:hidden` proprio (`.auth-page-blobs`, globals.css), mai
 * sull'intera colonna scrollabile: stesso bug del menu tagliato (§20).
 */
export function AuthPageBackground({ children }: { children: ReactNode }) {
  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4" position="relative">
      <div className="auth-page-blobs" aria-hidden="true">
        <div className="auth-page-blob auth-page-blob--one" />
        <div className="auth-page-blob auth-page-blob--two" />
      </div>
      <YStack width="100%" alignItems="center" position="relative" zIndex={1}>
        {children}
      </YStack>
    </YStack>
  );
}

/** Scheda bianca senza ombra (scelta dell'utente, §176) sopra AuthPageBackground. */
export function AuthCard({ children, maxWidth = 420, gap = "$5" }: { children: ReactNode; maxWidth?: number; gap?: "$3" | "$5" }) {
  return (
    <Surface className="auth-card-in" width="100%" maxWidth={maxWidth} borderRadius={radiusDocLg} padding="$6" gap={gap}>
      {children}
    </Surface>
  );
}
