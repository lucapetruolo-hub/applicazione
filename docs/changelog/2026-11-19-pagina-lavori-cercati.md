# Pagina "Lavori cercati" con tutti i mestieri e tre collegamenti

**Richiesta (Luca, 19/11/2026):** "ma non è ancora raggiungibile dalla
homepage?". La bacheca (`docs/changelog/2026-11-18-bacheca-cliente.md`) si
raggiungeva solo dal fondo di "Offri i tuoi servizi", con i soli mestieri del
sito: gli 8 lavori che il sito non ha (antennista, vetraio, spurghi…) non
avevano nessun link. Sulla scheda Luca ha scelto "Sì, pagina e tre
collegamenti".

**Cosa cambia**
- Nuova pagina `/lavora-con-noi` "Lavori cercati": tutti i mestieri del sito e,
  a parte, "Lavori che nessuno fa ancora sul sito", con accanto quante
  richieste aspettano (da `GET /request-board/summary`), l'interruttore
  dell'email del lunedì e l'iscrizione.
- "La tua zona" (richiesta di Luca: "gli interessano solo quelli della sua
  zona"): scelta della provincia in cima (`BoardZonePicker`, `?provincia=`),
  numeri solo di quella provincia, ogni mestiere porta dritto a
  `/lavora-con-noi/<mestiere>/<provincia>`; il browser ricorda la scelta. I
  mestieri con più richieste vengono prima.
- **Mappa** ("vai" di Luca dopo il piano in
  `analisi/bacheca-mappa-piano.md`): sotto "La tua zona" filtri Mestiere e
  Quando, la mappa con un cerchio e il numero per ogni luogo (centro del
  comune; i comuni sotto i 5.000 abitanti sul capoluogo, mai il punto
  esatto), verde scuro se c'è una richiesta di oggi o di ieri; spostandola
  "Cerca in quest'area", "Vicino a me" (posizione mai salvata), cerchio dei
  100 km per il professionista che ha fatto l'accesso, "Allarga la mappa"
  nelle zone vuote, elenco delle schede dell'area sotto. Filtri ricordati
  nel browser. I lavori online restano fuori dalla mappa.
  API `GET /request-board/map` (mestiere, quando, nord/sud/est/ovest; bordi
  arrotondati a 0,1° e un minuto di memoria breve), punto del luogo con
  `boardPlacePoint` in `packages/shared`. Sito: `BoardMapLazy` →
  `BoardMapSection` → `BoardMap` sopra `GoogleMapGate`.
- Collegamenti: piede del sito ("Per i professionisti" → "Lavori cercati"),
  riga dei mestieri in fondo a "Offri i tuoi servizi" ("Altri lavori
  cercati"), menu "Il mio account" del professionista (gruppo "Lavoro", non
  nella colonna laterale che resta a 7 voci).
- Briciole di pane delle pagine per mestiere e provincia con "Lavori cercati";
  la pagina nella sitemap (vuota finché il sito è privato).

**Motivo:** chi fa un mestiere che il sito non ha ancora deve poter trovare
le richieste che lo aspettano, che sono quelle che entrano subito in bacheca.

**Verifica:** typecheck di API e sito, `pnpm lint`, `request-board-map.test.ts`
(comune grande al centro, comune piccolo sul capoluogo, lavori online fuori,
bordi, filtri, posti finiti), foto da telefono e computer. In locale manca la
chiave Google: la mappa vera si controlla sul sito dopo l'unione.
