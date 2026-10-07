"use client";

import type { ReactNode } from "react";
import { Surface, YStack, brand, radiusDocLg } from "@professionisti/ui";

/**
 * Colonna centrata delle pagine a scheda singola (registrazione, accesso,
 * recupero password, completamento profilo). Le forme sfumate dello sfondo
 * ora sono di tutto il sito (`.site-blobs` in layout.tsx, docs/CHANGELOG.md
 * §180): qui il fondo resta trasparente per lasciarle vedere.
 */
export function AuthPageBackground({ children }: { children: ReactNode }) {
  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4" position="relative">
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
