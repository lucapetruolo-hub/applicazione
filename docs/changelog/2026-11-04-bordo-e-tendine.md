# Bordo che si riempie e tendine morbide

**Richiesta (Luca, 04/11/2026):** dopo la ricerca, passando col mouse sugli
orari dell'agenda e sui pulsanti del menu, una leggera animazione "che riempie
il bordo"; e un'apertura morbida delle tendine (caselle di categoria e città e
altri menu a comparsa), come su miodottore.it.

**Fatto (solo CSS in `apps/web/src/app/globals.css`, nessun JavaScript in più):**
- Bordo che si riempie: un filo verde (#128552, 1,5 px) corre lungo il bordo
  da sinistra a destra in 260 ms. Su orari liberi dell'agenda (risultati e
  profilo), frecce dei giorni, "Filtri", "Mappa", "Espandi mappa", voci del menu
  dell'area account, della tendina "Il mio account" (rosso su "Esci") e del
  menu "Servizi". Classi `.hover-ring` e `.hover-ring-host`/`.hover-ring-target`.
  Solo con il mouse (`hover: hover`); è un `::after`, nessuno spostamento
  dell'impaginazione.
- Tendine: categoria e città (`Autocomplete`), indirizzo, prefisso del
  telefono, "Il mio account", menu "…" delle schede, "+" della chat compaiono
  in 160-200 ms scendendo di 6 px e allargandosi appena (`.pop-in`, verso
  l'alto `.pop-in-up`), con `@starting-style` come le finestre.
- Con "riduci movimento": il filo compare subito, le tendine senza animazione.
  Nei browser senza `@starting-style` tutto come prima.

**Verifica:** fotogrammi prima/dopo (0, 60-80, 120-160, 400 ms) da computer e
telefono in `anteprime/bordo-e-tendine/` dei file del progetto.
