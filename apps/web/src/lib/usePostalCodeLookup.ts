"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";

/**
 * CAP cercato da solo da via e civico (docs/CHANGELOG.md §356): Google non lo
 * dà con l'indirizzo scelto per una via senza civico nelle città con più CAP
 * (es. "Via Cesare Battisti, Roma"). Si cerca dopo una breve pausa di
 * battitura del civico e si mette nel campo, che resta modificabile: scritto
 * a mano (`onTyped`) non viene più sovrascritto. Se non si trova resta da
 * scrivere. Usato da richiesta di preventivo, modifica richiesta e account.
 */
export function usePostalCodeLookup(input: {
  /** Cercarlo? Di solito: indirizzo scelto senza CAP, o suggerimenti non disponibili. */
  enabled: boolean;
  street: string;
  houseNumber: string;
  city: string;
  setPostalCode: (postalCode: string) => void;
}) {
  const { enabled, street, houseNumber, city, setPostalCode } = input;
  const [typed, setTyped] = useState(false);
  const [found, setFound] = useState(false);

  useEffect(() => {
    if (!enabled || typed || !street.trim() || !houseNumber.trim() || !city.trim()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      apiClient
        .addressPostalCode({ street: street.trim(), houseNumber: houseNumber.trim(), city: city.trim() })
        .then(({ postalCode }) => {
          if (cancelled || !postalCode) return;
          setPostalCode(postalCode);
          setFound(true);
        })
        .catch(() => undefined);
    }, 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, typed, street, houseNumber, city, setPostalCode]);

  return {
    /** Il CAP nel campo l'ha trovato il sito (per la riga "CAP trovato in automatico"). */
    found,
    /** Il cliente ha scritto il CAP: vale il suo. */
    typed,
    onTyped: () => {
      setTyped(true);
      setFound(false);
    },
    /** Nuovo indirizzo scelto: si torna a cercarlo. */
    reset: () => {
      setTyped(false);
      setFound(false);
    },
  };
}

/** Il CAP accetta solo cifre, al massimo 5. */
export function cleanPostalCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 5);
}
