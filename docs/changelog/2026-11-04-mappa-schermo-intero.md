# Mappa a schermo intero da telefono, con "Cerca in quest'area"

**Richiesta** (Luca, 04/11/2026, con due foto di miodottore.it): da telefono,
toccando "Mappa" in `/cerca`, la mappa deve aprirsi a schermo intero con una X
in alto a destra e un pulsante "Cerca in quest'area"; toccando un punto si vede
l'anteprima come oggi; chiudendo la mappa, nella lista restano solo i
professionisti della zona che si vedeva sulla mappa.

**Decisione** (`apps/web/src/components/ResultsListWithMap.tsx`,
`ResultsMap.tsx`), solo sotto i 700px:
- "Mappa" apre la mappa sopra tutto lo schermo (anche sopra l'intestazione e la
  barra dei professionisti scelti); la pagina sotto non scorre. Si chiude con
  la X (44px, in alto a destra) o con Esc; il fuoco torna su "Mappa".
- La mappa si sposta con un dito solo (`gestureHandling: "greedy"`): a schermo
  intero non c'è una pagina da scorrere. Sul computer resta "cooperative".
- Spostando o zoomando compare "Cerca in quest'area" in alto al centro. Prima
  la lista non cambia: spostare la mappa non deve cambiare i risultati senza
  che la persona lo chieda. Dopo il tocco il pulsante diventa "N professionisti
  qui" finché la mappa non si sposta di nuovo.
- Chiusa la mappa, la lista mostra solo chi è nell'ultima zona cercata, con la
  riga "Solo la zona cercata sulla mappa." e "Mostra tutti" per tornare ai
  risultati di prima. Aperta e chiusa senza cercare, la lista non cambia.
- Il tocco su un punto mostra l'anteprima di sempre in basso.
- Sul computer nulla cambia: la lista segue la mappa a ogni spostamento.

**Verifica**: `next build` + `next start` con un'API finta e un Google Maps
finto in Playwright (iPhone 13 e 1280×800): mappa a tutto schermo con la X,
nessun "Cerca in quest'area" all'apertura, pulsante dopo lo spostamento,
"5 professionisti qui" dopo il tocco, anteprima toccando un punto, lista con
5 schede e la riga "Mostra tutti" dopo la chiusura, fuoco di nuovo su "Mappa",
"Mostra tutti" riporta tutte le schede; sul computer la pagina è come prima.
