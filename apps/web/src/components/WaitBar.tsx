"use client";

import { useEffect, useState } from "react";
import { beginWait } from "@/lib/navigationProgress";

/**
 * Accende la barra di attesa in cima allo schermo finché `active` è vero
 * (docs/changelog/2026-11-10-barra-in-ogni-attesa.md). Compare solo se
 * l'attesa supera 300 ms, come per le pagine: sulle risposte veloci non
 * lampeggia.
 */
export function useWaitBar(active = true) {
  useEffect(() => {
    if (!active) return;
    return beginWait();
  }, [active]);
}

/**
 * Da mettere accanto a una sagoma grigia o a un "Caricamento…": finché è a
 * schermo la barra in cima resta accesa. Non disegna nulla.
 */
export function WaitBarSignal() {
  useWaitBar(true);
  return null;
}

/**
 * Dentro un pulsante verde o rosso mentre si aspetta il server (invio della
 * richiesta, creazione dell'account, accesso): la barra bianca al posto
 * della scritta, alla stessa altezza della riga. La frase resta per il
 * lettore di schermo.
 */
export function ButtonWaitBar({ label }: { label: string }) {
  return (
    <span className="button-wait-bar">
      <span className="flow-bar flow-bar--light" aria-hidden="true" />
      <span className="sr-only" role="status">
        {label}
      </span>
    </span>
  );
}

/** Oltre questo tempo il pulsante torna normale anche se la pagina nuova non è arrivata. */
const LEAVING_GIVE_UP_MS = 20_000;

/**
 * Dopo l'accesso o la creazione dell'account la pagina successiva può
 * metterci qualche secondo: il pulsante resta con la barra finché la pagina
 * cambia, invece di tornare "Registrati" per un attimo. Restituisce lo stato
 * e la funzione da chiamare subito prima di cambiare pagina.
 */
export function useLeavingWait(): [boolean, () => void] {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (!leaving) return;
    const giveUp = window.setTimeout(() => setLeaving(false), LEAVING_GIVE_UP_MS);
    return () => window.clearTimeout(giveUp);
  }, [leaving]);
  return [leaving, () => setLeaving(true)];
}

/** Dopo quanti secondi di attesa compare la frase che rassicura. */
const SLOW_HINT_AFTER_MS = 5_000;

/**
 * Frase sotto il pulsante quando l'attesa supera 5 secondi (creazione
 * dell'account): dice che non si è bloccato niente, così non si preme di
 * nuovo né si chiude la pagina. Prima dei 5 secondi non c'è.
 */
export function SlowWaitHint({ active, text = "Ancora un attimo, quasi fatto…" }: { active: boolean; text?: string }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_HINT_AFTER_MS);
    return () => {
      window.clearTimeout(timer);
      setSlow(false);
    };
  }, [active]);
  return (
    <p role="status" className={active && slow ? "slow-wait-hint" : "sr-only"}>
      {active && slow ? text : ""}
    </p>
  );
}
