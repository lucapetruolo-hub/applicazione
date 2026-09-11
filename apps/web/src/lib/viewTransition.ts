/**
 * View Transitions API (nativa del browser, nessuna libreria aggiunta —
 * Next.js 14.2.x non ha il supporto sperimentale integrato disponibile
 * solo da Next 15) — utility condivisa che avvolge una navigazione in
 * `document.startViewTransition` quando l'API è disponibile (Chrome/Edge),
 * altrimenti esegue la navigazione com'era prima, senza alcuna differenza
 * di comportamento su Safari/Firefox (degrado pulito, nessun errore).
 *
 * Applicata solo ai percorsi di navigazione più visibili/più battuti
 * (ricerca → profilo professionista, nav principale dell'header) invece
 * che a ogni singola `useRouter().push`/`<Link>` del sito — sostituire
 * `next/link`/`useRouter` ovunque (~40 file) avrebbe una superficie di
 * rischio (link con modificatori, `target="_blank"`, download, ecc.)
 * sproporzionata al puro polish visivo che questa funzionalità porta,
 * scelta di scope deliberata coerente con lo stesso principio già seguito
 * altrove in questo progetto ("non un giro esaustivo, priorità ai punti
 * più critici").
 */
export function navigateWithTransition(navigate: () => void) {
  const startViewTransition =
    typeof document !== "undefined"
      ? (document as Document & { startViewTransition?: (cb: () => void) => void }).startViewTransition
      : undefined;
  if (typeof startViewTransition === "function") {
    startViewTransition.call(document, navigate);
  } else {
    navigate();
  }
}
