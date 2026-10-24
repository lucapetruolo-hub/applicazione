"use client";

import Link from "next/link";
import { Text, YStack, brand } from "@professionisti/ui";
import { ConsentCheckbox } from "./ConsentCheckbox";

const linkStyle = { textDecoration: "underline", color: brand.cianografiaScuro } as const;

/**
 * Una sola spunta per Termini, Privacy e maggiore età (docs/CHANGELOG.md
 * §289, richiesta dell'utente sul modello di Didit): prima erano due caselle.
 * I Termini si accettano, l'informativa privacy si dichiara letta (non si
 * "accetta", come in ClientEmailFirstAuth). L'API riceve sempre le due
 * dichiarazioni (`acceptedLegalTerms`, `declaredAdult`), entrambe dal valore
 * di questa casella.
 *
 * `attempt`: quante volte si è provato a proseguire senza spuntarla; da 1 in
 * su la riga diventa rossa e ripete la scossa a ogni tentativo.
 */
export function LegalConsentCheckbox({
  checked,
  onToggle,
  attempt,
  id = "consenso",
}: {
  checked: boolean;
  onToggle: () => void;
  attempt: number;
  id?: string;
}) {
  return (
    <YStack key={attempt} gap="$2">
      <ConsentCheckbox id={id} checked={checked} invalid={attempt > 0} onToggle={onToggle}>
        Accetto i{" "}
        <Link href="/termini" target="_blank" style={linkStyle} onClick={(e) => e.stopPropagation()}>
          Termini di Servizio
        </Link>
        , ho letto la{" "}
        <Link href="/privacy" target="_blank" style={linkStyle} onClick={(e) => e.stopPropagation()}>
          Privacy Policy
        </Link>{" "}
        e ho almeno 18 anni.
      </ConsentCheckbox>
      {attempt > 0 && !checked ? (
        <Text role="alert" fontSize="$2" color={brand.urgenza} fontWeight="600">
          Spunta la casella per continuare.
        </Text>
      ) : null}
    </YStack>
  );
}

/** Scorre fino alla casella del consenso (dopo un invio senza spunta). */
export function scrollToLegalConsent(id = "consenso") {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById(id)?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
}
