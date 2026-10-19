"use client";

import { useState } from "react";

/**
 * Indirizzo da scegliere per forza dai suggerimenti di Google
 * (docs/CHANGELOG.md §214, richiesta esplicita dell'utente: "farti
 * selezionare per forza una scelta così da non mettere un indirizzo a
 * caso"). Usato da richiesta di preventivo, modifica richiesta e account.
 * Un indirizzo già salvato vale come scelto finché non si cambia; se il
 * servizio dei suggerimenti non risponde (o non è configurato sul server,
 * §263) si accetta il testo libero, per non bloccare nessuno.
 */
export function useChosenAddress(initiallyChosen: boolean) {
  const [chosen, setChosen] = useState(initiallyChosen);
  const [serviceDown, setServiceDown] = useState(false);
  const mustChoose = !serviceDown;
  return {
    chosen,
    setChosen,
    mustChoose,
    serviceDown,
    /** Da passare a `AddressAutocompleteInput.onServiceUnavailable`. */
    markServiceDown: () => setServiceDown(true),
    /** Indirizzo scritto a mano quando la scelta dall'elenco è obbligatoria. */
    missing: mustChoose && !chosen,
  };
}

/** Messaggio unico per l'indirizzo non scelto dall'elenco. */
export const ADDRESS_NOT_CHOSEN_MESSAGE = "Scegli l'indirizzo dall'elenco dei suggerimenti.";
