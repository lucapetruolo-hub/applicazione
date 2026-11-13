# Annullare e acconto: una sola fonte per tutte le frasi

**Richiesta** (Luca, 13/11/2026, thread "Correggere l'avviso di annullamento
con data passata"): "rendi corretti in ogni caso i testi su annullamento,
acconto e cifre del preventivo. Non correggere solo il caso della mia foto."
Prima la tabella di tutti i casi (momento, pagamento, acconto trattenuto o
restituito, tipo di data) in ogni punto; poi una PR per tema. Luca ha
approvato la PR 1 ("una sola fonte per le frasi, con le prove generate dalla
tabella") e le due migliorie "il professionista legge che l'acconto resta a
lui" e "la scadenza del promemoria dalla stessa fonte".

**Causa dei difetti**: le frasi erano scritte a mano in 10 file (scheda del
preventivo, riepilogo prima di Accetta, confronto, PDF, email, pagina
"Appuntamento prenotato", scheda del lavoro, scheda del professionista,
promemoria). Ognuno guardava l'ora a modo suo: 13 caselle sbagliate e 9
incoerenti (tabella in `analisi/annullamento-acconto/tabella-casi.md`, nella
cartella condivisa del progetto).

**Decisione**:
- `cancellationTerms()` in `packages/shared/src/cancellationNotice.ts` dà per
  ogni caso due righe (preavviso e soldi) con il tono: normale, grigio, ocra
  scuro (parole e colori dell'11/11, `2026-11-11-rosso-solo-errori.md`, mai
  rosso). I momenti sono quattro (`cancellationPhase`): prima del preavviso,
  dentro il preavviso, fascia già iniziata, fascia finita.
- Fascia già iniziata: "L'appuntamento è già iniziato: dopo aver accettato non
  si può più annullare." (prima diceva "mancano meno di 24 ore"). Fascia
  finita: nessuna riga.
- Data proposta dal cliente in attesa: la scadenza si calcola dalla data
  proposta, non da quella vecchia del professionista.
- Confronto dei preventivi: ora dice anche se l'acconto torna o no.
- Email e pagina "Appuntamento prenotato", scheda del lavoro: stesse frasi;
  con l'acconto restituito dentro il preavviso "Se annulli, l'acconto di X ti
  torna sulla carta, ma il professionista vede che hai annullato all'ultimo."
- Professionista, dentro il preavviso con l'acconto trattenuto: "Il preavviso
  è iniziato: se il cliente annulla ora, l'acconto di X resta a te."
- Promemoria della scadenza (`depositReminderTimes`): stessa scadenza
  (`freeCancellationDeadline`).
- Componente unico sul sito: `apps/web/src/components/CancellationTermsLines.tsx`.

**Verifica**:
- `packages/shared/src/cancellationTerms.test.ts`: una prova per casella della
  tabella, confini al minuto (24 ore e 1 minuto, 24 ore, 23 ore e 59 minuti),
  cambio d'ora (30/3 e 25/10), prove a caso con fast-check ("mai una data
  passata", "adesso + resto = massimo", niente importi negativi).
- Prove dell'API aggiornate (PDF, email legali), typecheck di sito e API,
  eslint.
- Playwright `preventivo-accettato.spec.ts`: fascia già iniziata e data
  proposta dal cliente.

Seguono (approvate): PR 2 (frase che si aggiorna con la pagina aperta,
controllo sul server ad Accetta, testo salvato sul lavoro), PR 3 (spostare un
appuntamento dentro il preavviso), PR 4 ("tutto online" con forbice: il minimo
subito, il resto a fine lavoro).
