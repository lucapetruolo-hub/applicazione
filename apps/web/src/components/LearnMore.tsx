"use client";

import { useId, useState, type ReactNode } from "react";
import { Text, YStack, brand } from "@professionisti/ui";

/**
 * Link "Scopri di più" che apre il dettaglio sotto la riga, senza cambiare
 * pagina (docs/CHANGELOG.md §247): le spiegazioni restano a portata di mano
 * ma fuori dalla vista finché non servono.
 */
export function LearnMoreToggle({ open, onToggle, controls }: { open: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        color: brand.cianografiaScuro,
        fontWeight: 700,
        fontSize: "inherit",
        fontFamily: "inherit",
        textDecoration: "underline",
        textUnderlineOffset: 2,
      }}
    >
      {open ? "Chiudi" : "Scopri di più"}
    </button>
  );
}

/** Riga breve + "Scopri di più" che mostra il testo completo. */
export function LearnMore({ summary, children, fontSize = 13 }: { summary: ReactNode; children: ReactNode; fontSize?: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <YStack gap="$2">
      <Text fontSize={fontSize} color={brand.grafite70}>
        {summary} <LearnMoreToggle open={open} onToggle={() => setOpen((v) => !v)} controls={id} />
      </Text>
      {open ? (
        <YStack id={id} padding="$3" borderRadius="$3" backgroundColor={brand.gesso} gap="$2">
          {children}
        </YStack>
      ) : null}
    </YStack>
  );
}
