# Rosso solo per gli errori: avviso del preavviso e altri stati

**Richiesta** (Luca, 11/11/2026, thread "Correggere la scritta rossa col
pagamento diretto"): "controlla la scritta in rosso che compare quando un
cliente paga direttamente al professionista". Dopo la proposta con le foto:
"Al pagamento diretto ricordagli solo che mancano meno di 24 ore e basta, poi
effettua miglioria 2" (cioè gli altri rossi che non sono errori). Poi:
"La scritta per l'acconto deve essere chiara, non rimborsabile perché
mancano meno di 24 ore, e anche se non mancano 24 ore dire chiaramente
all'accettazione o comunque scritto sul preventivo che pagando online se
annulla entro 3 giorni/24 ore ecc. perderà l'anticipo", "Elabora come alto
esperto del settore".

**Dove era la scritta**: nel riquadro "Prima di accettare"
(`QuoteAcceptSummary.tsx`), quando l'appuntamento è già dentro il preavviso
per annullare. Usciva in rosso e grassetto: "Mancano meno di 24 ore
all'appuntamento, il preavviso chiesto per annullare. Se poi annulli non
paghi niente, ma il professionista vede che hai annullato all'ultimo".
Usciva così anche quando il cliente non aveva niente da perdere, come col
pagamento diretto. Il rosso, che nel sito vuol dire errore, lo spaventava
proprio mentre accettava.

**Decisione**:
- Senza acconto da perdere (pagamento diretto, oppure online quando il
  professionista non tiene l'acconto) resta solo "Mancano meno di 24 ore
  all'appuntamento.", in grigio normale.
- Acconto che resta al professionista dopo il preavviso: si dice sempre, in
  ocra scuro (`brand.ottoneScuro`, "attenzione") invece del rosso, con la
  parola "non rimborsabile" e il giorno e l'ora esatti (come fanno le app
  di prenotazione: la scadenza non la deve calcolare il cliente,
  `freeCancellationUntilLabel` in `packages/shared/src/cancellationNotice.ts`):
  - sul preventivo, voce "Annullare": "Pagando online, se annulli dopo
    giovedì 19 novembre alle 08:00 l'acconto non è rimborsabile.";
  - prima di "Accetta", scelta la carta: "Annullamento gratuito fino a
    giovedì 19 novembre alle 08:00. Dopo, l'acconto di 24,00 € non è
    rimborsabile." Già dentro il preavviso: "Mancano meno di 24 ore
    all'appuntamento: l'acconto di 24,00 € non è rimborsabile, anche se
    annulli.";
  - su "Appuntamento prenotato" e nella scheda del lavoro fissato, la stessa
    frase; nella finestra "Annulla il lavoro": "l'acconto di N € non è
    rimborsabile: resta a lui".
  Prima si leggeva solo, in piccolo e in grigio, "Se annulli più tardi e hai
  pagato l'acconto online, l'acconto resta al professionista". La domanda 42
  per l'avvocato (penale o caparra, parola "non rimborsabile") è aggiornata
  in `analisi/domande-commercialista-avvocato.md`.
- Altri stati che non sono errori, dal rosso al grigio: "Hai rifiutato
  questo preventivo", "Il professionista ha ritirato questo preventivo",
  "Ha rifiutato" accanto al professionista, la riga "Annullata da te / dal
  professionista" sotto la pillola, "Chiuso" nei giorni chiusi dell'agenda.
- Dal rosso all'ocra scuro, perché chiedono un'azione ma non sono errori:
  "Il professionista accetta solo il pagamento online, che non è ancora
  attivo…", "Il cliente ha annullato con meno preavviso…" e "Il cliente ha
  risposto al promemoria che non può più esserci…".
- Restano rosse le pillole "Annullata" e "Scaduta" (colori chiesti da Luca,
  `requestStage.ts`), gli errori veri, le conferme per eliminare o rifiutare
  e le segnalazioni di problemi sul lavoro.

**Verifica**: foto prima e dopo da telefono e computer nella cartella del
progetto (`anteprime/scritta-rossa-pagamento-diretto/`; il caso con acconto
trattenuto simulato sul preventivo di prova). Prova della data in
`cancellationNotice.test.ts`, lint e controllo dei tipi del sito.
