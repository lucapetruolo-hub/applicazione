# Bordo che si riempie e tendine morbide

**Richiesta (Luca, 04/11/2026):** dopo la ricerca, passando col mouse sugli
orari dell'agenda e sui pulsanti del menu, una leggera animazione "che riempie
il bordo"; e un'apertura morbida delle tendine (caselle di categoria e città e
altri menu a comparsa), come su miodottore.it.

**Fatto (solo CSS in `apps/web/src/app/globals.css`, nessun JavaScript in più):**
- Bordo che si riempie: un filo verde (#128552, 1,5 px) corre lungo il bordo
  da sinistra a destra in 200 ms. Su orari liberi dell'agenda (risultati e
  profilo), frecce dei giorni, "Filtri", "Mappa", "Espandi mappa", voci del menu
  dell'area account, della tendina "Il mio account" (rosso su "Esci") e del
  menu "Servizi". Classi `.hover-ring` e `.hover-ring-host`/`.hover-ring-target`.
  Solo con il mouse (`hover: hover` e `pointer: fine`); è un `::after`, nessuno spostamento
  dell'impaginazione.
- Tendine: categoria e città (`Autocomplete`), indirizzo, prefisso del
  telefono, "Il mio account", menu "…" delle schede, "+" della chat compaiono
  in 160-200 ms scendendo di 6 px e allargandosi appena (`.pop-in`, verso
  l'alto `.pop-in-up`), con `@starting-style` come le finestre.
- Con "riduci movimento": il filo compare subito, le tendine senza animazione.
  Nei browser senza `@starting-style` tutto come prima.

**Verifica:** fotogrammi prima/dopo (0, 60-80, 120-160, 400 ms) da computer e
telefono in `anteprime/bordo-e-tendine/` dei file del progetto.

**Seguito (Luca: "effettua la miglioria della skill"):** installata nel repo la
skill `web-animation-design` di vercel-labs (`.claude/skills/web-animation-design/`,
solo testo, controllata prima, origine in `ORIGINE.md`). Rivista l'animazione
con i suoi criteri: filo più rapido (200 ms, è un gesto ripetuto spesso), solo
con un puntatore preciso (`pointer: fine`, non sui tablet al tocco), menu "…"
delle schede che si apre dall'angolo del pulsante (`.pop-in-right`).

**Rassegna di tutte le animazioni del sito con la skill (Luca: "effettua la
miglioria come ritieni"):**
- Riquadro di accesso e registrazione: compare in 250 ms salendo di 8 px
  (prima 450 ms e 16 px): si vede a ogni accesso.
- Freccia dei pulsanti principali: ruota in 200 ms (prima 350 ms), solo con il
  mouse.
- Schede "Cliente / Professionista" della registrazione e frecce di "Quanto
  costa": si sollevano o si spostano solo con il mouse; sul telefono la scheda
  toccata restava sollevata.
- Lasciate come sono, già in regola: finestre, tendine, avvisi (sotto i 300 ms,
  partenza rapida), luci della hero e recensioni che scorrono (pagine
  pubbliche, lente per scelta), "Richiesta inviata" (si vede di rado).
- Non toccati perché scelte di Luca: il rimbalzo del pulsante "magnetico" in
  home (la skill sconsiglia il rimbalzo) e il cuoricino che batte.
