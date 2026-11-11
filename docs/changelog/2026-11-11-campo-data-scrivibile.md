# Campo data: si scrive a mano e c'è il calendarietto

**Richiesta** (Luca, 11/11/2026): dopo il campo orario
(docs/changelog/2026-11-10-campo-orario-scrivibile.md, PR #317), approvata la
miglioria proposta: il campo data con lo stesso stile, scrivibile e con un
calendarietto.

**Decisione** (da esperto UX): `ItalianDateInput`, l'unico campo data del sito,
non usa più il campo data del browser. Cambia in tutti i suoi punti (lavoro
esterno, chiusura di giorni e ferie in Agenda, "Torno il", data proposta nel
preventivo e nella controproposta, scelta della data del cliente, "I miei
clienti", date di Statistiche, data di nascita nei dati fiscali).
- **Si scrive a mano**: tastiera dei numeri sul telefono, barre messe da sole
  anche scrivendo una cifra alla volta ("101126" → 10/11/26, all'uscita
  10/11/2026); vanno bene "10/11" (anno in corso, o il prossimo se la data
  sarebbe già passata rispetto al minimo), "10-11-26", "10.11.2026" e una data
  incollata "2026-11-10". Un anno di due cifre è il 2000, o il 1900 se andrebbe
  oltre il massimo (data di nascita "5.6.85" → 05/06/1985). Frecce su e giù:
  un giorno.
- **Avviso sotto il campo**, senza cambiare il valore: "Questa data non esiste:
  scrivila come 10/11/2026" (31/02), "Scegli una data dal … in poi" o "fino
  al …" fuori dai limiti. Bordo rosso, `aria-invalid` e avviso letto dal
  lettore di schermo; sparisce appena si scrive.
- **Calendarietto**: dal pulsante del calendario (al computer anche con un clic
  nel campo), nello stesso riquadro della rotella delle ore: sotto il campo al
  computer, dal basso sul telefono. Un mese alla volta da lunedì, mese e anno
  da scegliere (comodo per la data di nascita), frecce del mese, oggi
  cerchiato, giorno scelto pieno in verde, giorni fuori dai limiti spenti.
  Un tocco sul giorno lo sceglie e chiude. Da tastiera: frecce di un giorno o
  una settimana, Pagina su/giù di un mese, Inizio/Fine della settimana, Invio
  sceglie, Esc chiude solo il calendario.
- **Un solo riquadro per ora e data**: la parte comune (posizione, telefono,
  Esc, clic fuori, "Fatto", pulsante nel campo) sta in
  `apps/web/src/components/PickerPopover.tsx`, usata da `ItalianTimeInput` e
  `ItalianDateInput`. Colori al passaggio del mouse solo dove c'è un mouse
  (sul telefono restavano accesi dopo il tocco).
- I campi data dentro un `<label>` senza `ariaLabel` (Agenda "Dal"/"Al",
  Statistiche) ora ce l'hanno: il nome del pulsante del calendario non finisce
  nel nome del campo.
- Anche il giorno delle note in Admin › Andamento usa lo stesso campo
  (approvato da Luca lo stesso giorno, seconda PR): senza data "Aggiungi la
  nota" resta spento, al posto del `required` del campo del browser.

**Verifica**: lint e typecheck di `apps/web`; prova nuova
`e2e/tests/campo-data.spec.ts` (scrittura una cifra alla volta, anno mancante,
frecce, data inesistente, calendarietto con tocco e tastiera, Esc, posizione
al computer e sul telefono, giorni passati spenti e avviso in "Chiudi un
giorno"); `iphone-campi-orario.spec.ts` aggiornata con WebKit; giro completo
delle prove. Foto in `anteprime/campo-data/` della cartella del progetto.
