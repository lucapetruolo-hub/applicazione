# Collaudo del 29/10: accettazione, date, chiusure e annullamenti (gruppi 3 e 4)

**Richiesta**: correggere i difetti dei gruppi 3 ("Accettazione, date e stati
del lavoro") e 4 ("Chiusura degli account e annullamenti") del collaudo del
29/10 (`collaudo/2026-10-29/riepilogo.md`), in una sola PR come da piano, più
D-07 ("Annulla intervento" accanto a "Lavoro terminato") lasciato dal gruppo 6.

## Prima di accettare un preventivo (A-05, A-06, A-07, M-02, C-08)

- **A-07**: "Accetta preventivo" non parte più con un tocco. Apre sempre il
  riepilogo "Prima di accettare" (`QuoteAcceptSummary.tsx`), con le righe Con,
  Quando, Prezzo e Pagamento; la scelta del pagamento compare solo se il
  professionista ne offre più di uno. Il pulsante finale dice cosa succede:
  "Accetta e paga l'acconto" oppure "Accetta con obbligo di pagare".
- **M-02**: nel riepilogo c'è chi esegue il lavoro (nome o ragione sociale,
  partita IVA, sede "Città (PR)", dai dati fiscali: `quoteExecutor` in
  `guided-requests.service.ts`). Per il lavoro occasionale c'è la frase già
  usata altrove (`TRADER_STATUS_COPY.PRIVATE.note`). Sotto c'è il link
  "Recesso e annullamento" ai Termini (`/termini#recesso`, la bozza del
  gruppo 7). C'è anche la riga "Accettando, X vedrà il tuo telefono e
  l'indirizzo del lavoro" (CLAUDE.md §5.9).
- **A-06, C-08**: se l'appuntamento è già dentro il preavviso del
  professionista, il cliente lo legge in rosso prima di accettare, e nel
  menu "Annulla appuntamento" il testo lo dice. Anche il professionista
  vede l'avviso quando sceglie un orario dentro il proprio preavviso.
- **A-05**: sul preventivo ricevuto "Modifica" diventa "Proponi un'altra data".

## Date e orari (B-05, D-09, I-07, C-07, 0-07)

- **B-05**: gli orari "Inviata", "Ricevuta", "Inviato il … alle" e quelli
  della chat e dell'admin si mostrano nel fuso di Roma. Prima comparivano
  un'ora indietro sul server.
- **B-05, D-09**: le fasce che finiscono fra meno di 2 ore, o già passate,
  non si propongono più (`slotStillOffered` in `packages/shared/src/availability.ts`):
  agenda pubblica, anteprima, fasce del professionista e scelta della fascia
  generica. Il server rifiuta anche un preventivo con l'inizio già passato.
- **I-07**: una fascia arrivata da un link con una data impossibile o passata
  non resta più scelta (`linkSlotUsable`). Se l'agenda dice che non è più
  libera, compare la riga "L'orario del link non è più disponibile".
- **C-07, 0-07**: preparando il preventivo è già scelto l'orario chiesto dal
  cliente, se è libero, non quello di oggi. Se l'orario scelto è diverso,
  compare una riga che lo dice.

## Stati del lavoro (A-17, 0-10, O-02, 0-14, D-07, O-03)

- **A-17**: quando il cliente segna "Lavoro terminato", il professionista
  riceve subito l'avviso di chiudere con l'importo finale, senza aspettare il
  promemoria dei giorni dopo. Tutti e due vedono la riga "Hai confermato /
  Il cliente ha confermato che il lavoro è terminato".
- **0-10, O-02**: già corretti nella PR #194 (F-01). "Lavoro terminato" è
  bloccato sul server prima del giorno dell'appuntamento.
- **0-14**: non riprodotto. La nuova prova nel browser `e2e/tests/oggi-appuntamento.spec.ts`
  rifà il caso del collaudo (appuntamento di domani 08:00-13:00, poi "Fai
  passare il tempo" di un giorno, pagina aperta dopo le 13): l'appuntamento
  resta in "Oggi e domani". La lista degli appuntamenti ora si ricarica sempre
  senza cache (`no-store`), come quella delle richieste (F-10): con la pagina
  già aperta prima di far passare il tempo, il professionista vedeva i dati
  vecchi.
- **D-07**: con "Lavoro terminato" disponibile, "Annulla intervento" esce
  dalla riga dei pulsanti e resta nel menu.
- **O-03** (decisione di Luca del 2/11, migliorie accettate): una parola
  per ogni momento, scritta in `docs/glossario.md`. Preventivo accettato =
  **Fissato** (schede, filtri, agenda, messaggi, statistiche "Lavori
  fissati"); lavoro fatto = **Terminato** (stesso nome del pulsante "Lavoro
  terminato", già usato nei Termini); **Annulla il lavoro** per cliente e
  professionista, con la finestra dallo stesso nome; **appuntamento** per
  giorno e ora; sotto le recensioni "Lavoro fatto tramite il sito". Restano
  le parole già decise da Luca ("Elimina richiesta", "Lavoro occasionale").

## Chiusura degli account (B-01, P-06)

- **B-01**: quando il cliente chiude l'account, i suoi appuntamenti futuri si
  annullano con la stessa strada di "Annulla appuntamento" (rimborsi
  compresi). Il professionista riceve l'avviso "Il cliente ha chiuso
  l'account", e via, civico e telefono del lavoro vengono cancellati
  (`cancelFutureJobsOfClosedClient`). Prima di confermare, la pagina Account
  elenca gli appuntamenti che verranno annullati. Dopo la chiusura si arriva
  su `/account-eliminato`.
- **P-06**: il professionista non può chiudere l'account con soldi ancora
  bloccati, contestazioni in banca, segnalazioni aperte o un debito verso la
  piattaforma: la pagina elenca cosa c'è e rimanda all'assistenza
  (`GET /auth/me/closure-check`, controllato anche in `DELETE /auth/me`).

## Annullamenti e avvisi (B-07, B-09, F-10, F-11, F-16)

- **B-07**: "Elimina richiesta" è un pulsante visibile sulla scheda mentre
  la richiesta è aperta, non solo nel menu.
- **B-09**: quando il cliente ritira una richiesta, chi l'aveva ricevuta e
  non l'aveva rifiutata riceve un avviso solo sul sito ("Richieste
  ritirate", tipo `REQUEST_WITHDRAWN`, senza email come deciso al §343), e
  il suo "Nuova richiesta" si spegne. Se il cliente annulla l'eliminazione,
  l'avviso sparisce.
- **F-10**: la scheda "Scadute" si chiama "Chiuse". Ogni richiesta chiusa ha
  la sua etichetta ("Ritirata dal cliente", "Rifiutata da te", "Scelto un
  altro", "Preventivo ritirato", "Preventivo rifiutato"). Una richiesta
  ritirata dal cliente va in "Annullate".
- **F-11**: quando il cliente accetta un preventivo, gli altri professionisti
  con un preventivo ancora aperto ricevono "Il cliente ha scelto un altro
  professionista" (`QUOTE_NOT_CHOSEN`, sotto "Esito dei preventivi").
- **F-16**: gli avvisi dei lavori dicono quale lavoro e con chi
  (`withJobContext` in `notifications.service.ts` aggiunge `jobLabel` e
  `who`), e dove serve la cifra: importo finale, saldo addebitato, stelle
  della recensione, acconto trattenuto.

## Decisioni di Luca del 2/11

- **F-05** (importo finale sopra il preventivo che il cliente deve accettare
  o rifiutare): non si fa.
- Il pulsante "Accetta con obbligo di pagare" resta (Codice del consumo art. 51).
- La chiusura dell'account del professionista resta bloccata con soldi
  trattenuti, contestazioni o segnalazioni aperte.

**Verifica**: typecheck di API e sito, `pnpm lint`, test dell'API (1136) e
di `packages/shared` (25, nuovi `availability.test.ts`), nuovi test per F-11
e B-09.
