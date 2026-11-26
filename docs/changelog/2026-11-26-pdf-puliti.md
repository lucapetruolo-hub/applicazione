# PDF più puliti, sul modello delle fatture di Claude Max

**Richiesta** (Luca, 26/11/2026, thread "Rendere più pulite ricevute e fatture"):
rivedere ricevute e fatture prendendo spunto dalla fattura e dalla ricevuta
dell'abbonamento Claude Max, con un confronto voce per voce da esperto. Dopo
l'anteprima Luca ha deciso: carattere Helvetica (niente Figtree), riquadro per
la marca da bollo sì, stesso stile su tutti i PDF sì, bollo a carico del
cliente no.

**Decisione**: si cambia il motore unico dei PDF
(`apps/api/src/accounting/document-pdf.ts`), così tutti i documenti cambiano
insieme:
- titolo corto a sinistra e nome di chi emette in un riquadro verde chiaro a
  destra (al posto del logo, non ancora deciso); dalla seconda pagina solo il
  nome, piccolo;
- dati del documento in colonna ("Numero", "Data di emissione", ...);
- "Da" e "Intestata a"/"Cliente" affiancati senza riquadri color crema;
- nuovo blocco `amount`: la cifra in una frase ("71,98 € pagati il 15
  novembre 2026");
- tabelle con intestazione più leggera e righe di gruppo (il lavoro nella
  fattura delle trattenute);
- totali nella metà destra con righe sottili e il totale in grassetto;
- piede su ogni pagina con una riga sottile, il riferimento del documento
  (`footer` del modello, es. "Fattura ABB/2026/0001 · 71,98 € · Copia di
  cortesia") e sempre "Pagina 1 di 1";
- `signature` con `stamp`: riquadro tratteggiato "Marca da bollo 2 €" accanto
  alla firma.

Fatture e note di credito (`invoicePdfModel`): tabella Descrizione/IVA/Importo,
"IVA 22% su 59,00 €", sezione "Pagamento" (metodo, data, importo), note in
grigio al posto del riquadro verde; resta il riquadro solo per la mancata
consegna SdI. Niente colonne Quantità e Prezzo: da noi sono sempre 1 e uguali
all'importo, sarebbero solo rumore.

Ricevuta occasionale (`courtesyPdfModel`): titolo "Ricevuta" con sottotitolo
"Prestazione occasionale", frase "60,00 € ricevuti il ..." (il netto se c'è la
ritenuta), tabella, riquadro per la marca da bollo sopra 77,47 €.

Preventivo: prima i dati in colonna, poi il totale.

Non cambiano i contenuti obbligatori: "Copia di cortesia", TD01/TD04/TD24,
MP08/MP22, REA, capitale, PEC, ritenuta del 20%, frase sul bollo.

**Voci di Claude lasciate fuori**: subtotale e "totale senza IVA" ripetuti,
due documenti separati (fattura e ricevuta: in Italia basta la fattura),
"Paga online" (è già pagata), ultime 4 cifre della carta (non le salviamo con
la fattura: servirebbe una colonna nuova, proposta a parte).

**Verifica**: test dei PDF (`documents-pdf-sdi.test.ts`,
`job-documents.test.ts` aggiornati ai titoli nuovi), tsc, eslint; pacchetto per
il commercialista e anteprime degli altri PDF rigenerati e guardati uno per
uno (anteprime in `anteprime/pdf-pulite/` della cartella del progetto).
