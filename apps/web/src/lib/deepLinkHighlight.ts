/**
 * Evidenzia brevemente l'elemento a cui si è appena scrollato da un deep
 * link (click su una notifica) — richiesta esplicita dell'utente: "non deve
 * solo portarmi alla pagina esatta ma anche all'altezza di dove è presente
 * quella determinata variazione, magari evidenziandola leggermente per
 * qualche secondo con transizione della luce". Manipola il `classList` del
 * nodo DOM direttamente (nessuno stato React per elemento necessario): la
 * classe stessa (`.deep-link-highlight`, globals.css) porta già l'intera
 * animazione di dissolvenza, qui basta aggiungerla e toglierla dopo un
 * tempo fisso.
 */
export function highlightDeepLinkTarget(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.classList.remove("deep-link-highlight");
  // Forza un reflow prima di riaggiungere la classe: senza, un secondo
  // click sullo stesso elemento entro la finestra di evidenziazione non
  // ripartirebbe da capo (la classe sarebbe già presente, l'animazione CSS
  // non si riavvia da sola su una classe già applicata).
  void el.offsetWidth;
  el.classList.add("deep-link-highlight");
  window.setTimeout(() => el.classList.remove("deep-link-highlight"), 2600);
}
