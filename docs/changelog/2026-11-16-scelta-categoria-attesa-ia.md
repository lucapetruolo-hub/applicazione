# Scelta della categoria: "Sto capendo chi ti serve…" e "Ti serve: …" sotto la descrizione

**Richiesta** (Luca, 16/11/2026, thread "Modernizzare la scelta della
categoria"): "Effettua le due migliorie" uscite dal test con 5 persone
simulate (rapporto nel progetto, `analisi/scelta-categoria/test-5-persone-risultati.md`).
Nello stesso giro Luca ha scelto di togliere le pillole "Oppure" (PR #371
chiusa senza unirla): confondevano 3 persone su 5.

**Decisione**:
- **Attesa dell'IA.** Quando il dizionario ha un dubbio, al posto delle
  pillole compare "Sto capendo chi ti serve…" (alta quanto la scheda, con
  "Scegli tu" per vedere subito tutte le categorie). All'arrivo dell'IA si
  mostra la forma giusta una volta sola: la scheda se è sicura, le pillole
  altrimenti. Prima si vedevano le pillole e, qualche secondo dopo, la
  scheda: la forma cambiava sotto gli occhi e una persona non si è accorta
  del secondo mestiere. Se l'IA non risponde (errore o 9 secondi), restano
  le pillole del dizionario come prima.
- **L'IA parte anche dopo 1,5 secondi di pausa nella scrittura**, solo
  quando il dizionario ha un dubbio e con almeno 10 lettere, non più
  soltanto uscendo dal campo: da telefono si scorre senza uscire dal campo
  e l'attesa non finirebbe mai. Costo: qualche domanda in più all'IA per
  frasi lasciate a metà (le stesse regole di prima su chi la paga e su cosa
  finisce in "Mestieri richiesti").
- **"Ti serve: Idraulico ⌄" sotto la descrizione** (con "· forse anche Tutto
  Fare" se c'è un altro mestiere proposto): da telefono la scelta sta più in
  basso e 2 persone su 5 l'hanno trovata solo cercando "Avanti". Un tocco
  porta alla scelta. Durante l'attesa la riga dice "Sto capendo chi ti
  serve…".

**Verifica**: `e2e/tests/richiesta-preventivo.spec.ts` (attesa senza pillole
in mezzo e poi scheda dell'IA, anche senza uscire dal campo; "Scegli tu";
riga "Ti serve" che porta alla scheda; "forse anche Idraulico"), 53 passate
da telefono e computer. Foto `9-attesa-ia-telefono.png` e
`10-ti-serve-sotto-la-descrizione-telefono.png` in
`anteprime/scelta-categoria/dopo/` del progetto.
