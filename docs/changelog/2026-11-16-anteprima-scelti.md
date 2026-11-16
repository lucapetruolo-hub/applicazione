# Anteprima dei professionisti scelti nei risultati

**Richiesta** (Luca, 16/11/2026, con una foto da iPhone): al posto della frase
"Hai scelto Elettro Bianchi: puoi aggiungerne altri, fino a 5." e del pulsante
"Annulla la scelta", un'anteprima orizzontale sintetica del professionista
scelto, con una X in alto a destra per toglierlo.

**Decisione**:
- `ChosenProsStrip` (sopra i risultati della ricerca per problema): una scheda
  corta per ogni scelto con foto verticale piccola, nome, mestiere · città e,
  se ha recensioni, stelle e numero. Bordo verde di marca, angoli 20, X tonda
  piatta (32 px a vista, 44 da toccare). Tocco sulla scheda: apre il profilo
  come dalle schede dei risultati (`scelta=1`, problema scritto).
- Titolo "Scelti N su 5" con una riga: "Puoi aggiungerne altri con «Scegli»"
  (uno) o "La richiesta arriva solo a loro" (più di uno); da telefono la riga
  va sotto il titolo. Con più scelti, "Togli tutti" al posto di
  "Annulla la scelta".
- Da telefono le schede stanno in una fila che scorre col dito (si vede
  l'inizio della successiva, così si capisce che ce ne sono altre); da
  computer vanno a capo su una griglia.
- La X toglie solo quel professionista (`remove` in `useChosenPros`); il
  fuoco passa alla X accanto, o al titolo se era l'ultima.
- `ChosenPro` ha ora mestiere, città, voto e recensioni facoltativi: le scelte
  salvate prima (sessionStorage) mostrano solo nome e foto.

**Verifica**: typecheck e lint; sito e API in locale con 4 elettricisti a
Rieti, foto da iPhone 14 e da computer con 1 e 4 scelti
(anteprime/anteprima-scelti/ nei file del progetto); la X toglie il
professionista e sposta il fuoco sulla X successiva; prova nel browser in
`e2e/tests/scelti-restano.spec.ts`.
