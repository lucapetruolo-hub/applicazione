# Accettare il preventivo in una finestra, senza ripetizioni

**Richiesta** (Luca, 18/11/2026): "quando il cliente deve accettare un
preventivo, ci sono troppe scritte ed è troppo confusionario". Piano da esperto
UX e poi lavoro.

**Cosa non andava**: in "Le mie richieste", premendo "Accetta preventivo" si
apriva in fondo alla scheda (già lunga) la scelta "Come vuoi pagare?" e poi il
riquadro "Prima di accettare". Data, prezzo e pagamento si leggevano tre volte;
"il professionista riceve i soldi quando confermi" tre volte; l'annullamento
due; molte righe grigie piccole di seguito, tutte con lo stesso peso.

**Decisione**:
- **Scheda del preventivo** più corta: in "Pagamento" un modo per riga con le
  cifre in mezza riga (`quotePaymentShortLine` in `packages/shared`, per esempio
  "150,00 € subito, il resto solo se serve"). Tolti "Puoi pagare in due modi",
  l'elenco numerato e il paragrafo finale.
- **"Accetta preventivo" apre una finestra** (`ModalDialog`, come le altre del
  sito), titolo "Accetta il preventivo" con chi e quando in una riga. Dentro,
  in ordine: "Come vuoi pagare?" (una riga per modo, "Consigliato" come
  etichetta verde chiaro, il diretto resta una riga sola come deciso in §228),
  la nota sulla detrazione accanto alla scelta, le cifre una volta sola (paghi
  ora, a lavoro finito, prezzo) con la frase su quando arrivano i soldi al
  professionista dentro lo stesso riquadro, poi le righe obbligatorie
  (annullamento e acconto non rimborsabile in ocra, contatti visibili, chi
  esegue il lavoro o la riga breve del privato con "Recesso e annullamento"),
  la fattura o ricevuta e i pulsanti. Da telefono i pulsanti sono uno sopra
  l'altro e larghi, "Accetta e paga X €" in alto; "Torna indietro" come nelle
  altre finestre. Il fuoco va sul titolo: la finestra si apre dall'inizio.
- Nelle righe delle cifre l'importo sta sulla riga della voce e la
  spiegazione sotto a tutta larghezza (prima la cifra del resto scendeva da
  sola sotto la spiegazione).

Restano invariati: pulsante con l'obbligo di pagare (art. 51), chi esegue il
lavoro (art. 49), frasi su annullamento da una sola fonte, verifica email,
nessun modo scelto di serie quando sono più di uno.

**Verifica**: foto prima/dopo da telefono e computer in
`anteprime/accettazione-preventivo/` (cartella del progetto); prove e2e
`prima-di-accettare`, `preventivo-accettato`, `schede-lavoro`, `tastiera`,
`confronto-preventivi`, `fascia-in-corso`, `le-mie-richieste-leggera`
passate su telefono e computer; prova unitaria della riga corta.
