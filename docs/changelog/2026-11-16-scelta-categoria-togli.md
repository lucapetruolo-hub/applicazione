# Scelta della categoria: "×" per togliere un mestiere e numero di richieste più chiaro

**Richiesta** (Luca, 16/11/2026, thread "Modernizzare la scelta della
categoria"): "si" alle due migliorie emerse dal secondo giro del test con 5
persone simulate (`analisi/scelta-categoria/test-5-persone-risultati.md`
nella cartella del progetto): una "×" per togliere un mestiere aggiunto, e la
frase "una richiesta per mestiere" più grande accanto al contatore.

**Decisione**:
- **"×" (Togli) sulle righe aggiunte** della scheda `CategoryChoice`: la
  prima riga tiene "Cambia", le altre hanno un pulsante tondo da 44 px con
  `aria-label="Togli <mestiere>"`. Toccato, il mestiere torna tra i "+ Può
  servire anche".
- **Numero di richieste detto in chiaro** (`GuidedRequestForm`): con più di
  un mestiere il contatore diventa "2 di 3 · 2 richieste" e sotto la scheda
  compare "Partono 2 richieste, una per mestiere." in testo normale (15 px,
  scuro, icona di invio) al posto della riga piccola e grigia "Riceverai una
  richiesta separata per ogni categoria.".

**Motivo**: nel secondo giro 2 persone su 5 non sapevano come togliere un
mestiere aggiunto (Rosa: "Come lo tolgo il Tutto Fare?"), e la riga grigia
lasciava il dubbio (Rosa: "o una sola con tutte e due?").

**Verifica**: `e2e/tests/richiesta-preventivo.spec.ts`, prova "+ mestiere
proposto": dopo "Aggiungi Idraulico" si vedono "Partono 2 richieste, una per
mestiere." e "2 di 3 · 2 richieste"; "Togli Idraulico" lo toglie, lascia
Imbianchino, la frase sparisce e "Aggiungi Idraulico" ritorna (53 passate).
Foto: `anteprime/scelta-categoria/dopo/11-togli-e-richieste-telefono.png`.
