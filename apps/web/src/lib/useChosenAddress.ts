"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/apiClient";

/** Risposta di `GET /address/status` riusata per un minuto tra un modulo e l'altro. */
const STATUS_TTL_MS = 60_000;
let statusCache: { at: number; promise: Promise<boolean> } | null = null;

function suggestionsAvailable(): Promise<boolean> {
  if (!statusCache || Date.now() - statusCache.at > STATUS_TTL_MS) {
    statusCache = {
      at: Date.now(),
      // Se il controllo stesso non risponde si prova comunque con i suggerimenti:
      // al primo errore il campo passa ai campi separati.
      promise: apiClient
        .addressStatus()
        .then((status) => status.available)
        .catch(() => true),
    };
  }
  return statusCache.promise;
}

/**
 * Indirizzo da scegliere per forza dai suggerimenti di Google
 * (docs/CHANGELOG.md §214, richiesta esplicita dell'utente: "farti
 * selezionare per forza una scelta così da non mettere un indirizzo a
 * caso"). Usato da richiesta di preventivo, modifica richiesta e account.
 * Un indirizzo già salvato vale come scelto finché non si cambia; se il
 * servizio dei suggerimenti non risponde (o non è configurato sul server,
 * §264) si accetta il testo libero, per non bloccare nessuno.
 *
 * Il servizio si controlla appena il modulo si apre (§319): se non funziona,
 * i campi separati ci sono già dall'inizio, invece di comparire all'improvviso
 * dopo le prime lettere scritte. `lostWhileTyping` resta per il caso raro in
 * cui Google smette di rispondere proprio mentre si scrive.
 */
export function useChosenAddress(initiallyChosen: boolean) {
  const [chosen, setChosen] = useState(initiallyChosen);
  const [serviceDown, setServiceDown] = useState(false);
  const [lostWhileTyping, setLostWhileTyping] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void suggestionsAvailable().then((available) => {
      if (!cancelled && !available) setServiceDown(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const mustChoose = !serviceDown;
  return {
    chosen,
    setChosen,
    mustChoose,
    serviceDown,
    lostWhileTyping,
    /** Da passare a `AddressAutocompleteInput.onServiceUnavailable`. */
    markServiceDown: () => {
      // Il prossimo modulo aperto parte già con i campi separati.
      statusCache = { at: Date.now(), promise: Promise.resolve(false) };
      if (!serviceDown) setLostWhileTyping(true);
      setServiceDown(true);
    },
    /** Indirizzo scritto a mano quando la scelta dall'elenco è obbligatoria. */
    missing: mustChoose && !chosen,
  };
}

/** Messaggio unico per l'indirizzo non scelto dall'elenco. */
export const ADDRESS_NOT_CHOSEN_MESSAGE = "Scegli l'indirizzo dall'elenco dei suggerimenti.";
