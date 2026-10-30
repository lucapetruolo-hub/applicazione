# Riordino dell'area Admin, parte 2: Persone

**Richiesta** (Luca, thread "Riordinare l'area Admin", 30/10/2026): seconda
delle 3 PR approvate ("Sì, tutte e 3"), dopo la parte 1
(`2026-10-30-admin-riordino.md`). Dall'analisi
(`/mnt/project-files/analisi/admin-riordino/analisi-e-proposta.md`) e dalla
misura prima del riordino, dove un agente che non conosceva il sito non
riusciva a nascondere una recensione dalla scheda, a ritrovare un account
chiuso e a vedere gli account con lo stesso telefono. Dentro anche il gruppo
12 del collaudo (account chiusi e I-08).

**Decisione:**

- **Scheda della persona a schede** (`/admin/utenti/[id]`): Riepilogo,
  Richieste, Lavori, Recensioni, Pagamenti, Segnalazioni, Cronologia. La
  scheda scelta resta nell'indirizzo (`?scheda=lavori`). Gli stati sono in
  italiano ("Terminato", non "COMPLETED"), con i link ai casi: l'altra
  persona del lavoro, Problemi, Pagamenti, Segnalazioni.
- **Segnali da controllare**, in cima alla scheda e solo se ci sono
  (`apps/api/src/admin/user-signals.ts`, tipi ed etichette in
  `packages/shared/src/adminSignals.ts`): stesso telefono, indirizzo, codice
  fiscale o P.IVA di un altro account, con il link all'altro account;
  recensione scritta entro 48 ore dall'iscrizione; lavoro chiuso prima
  dell'appuntamento; acconto del 100% chiesto da un professionista iscritto da
  meno di 30 giorni. Fuori gli account chiusi e quelli di prova. Si guardano
  i dati dell'ultimo anno; con i numeri di oggi si calcolano a ogni apertura,
  se un giorno diventasse lento si passa a un calcolo notturno salvato.
- **Persone → Account sospetti** (`/admin/account-sospetti`,
  `GET /admin/suspicious-users`, solo moderatori): chi ha almeno un segnale,
  prima chi ne ha di più. Il sito non decide niente da solo.
- **"Nascondi la recensione" e "Togli dalla ricerca" dalla scheda**
  (`POST /admin/users/:id/moderate`, solo moderatori), sulla strada delle
  segnalazioni, senza una strada nuova: si apre una segnalazione a nome
  dell'admin e la si decide subito con `resolveContentReport`. Motivo
  dall'elenco delle segnalazioni, regola o legge violata e spiegazione per
  l'autore sono obbligatori; l'autore riceve la stessa email delle
  segnalazioni, con come contestare. "Rimetti visibile" e "Rimetti nella
  ricerca" sono l'"Annulla misura" che già c'era, con il motivo obbligatorio.
  La finestra è quella standard del sito (`CancelBookingModal`), il pulsante
  dice cosa fa.
- **"Togli dalla ricerca" separato da "Sospendi account"**: il profilo esce
  da ricerca e pagina pubblica, la persona può ancora entrare e finire i
  lavori già presi.
- **"Attivo" solo se è vero**: un profilo fuori dalla ricerca (sospeso,
  in pausa, dati fiscali mancanti, da confermare, bloccato) mostra il perché
  (`PROFESSIONAL_STATUS_ONE_LABEL`), sia nell'elenco sia nella scheda.
- **Numero delle recensioni spiegato**: se alcune sono nascoste la scheda
  dice "il profilo ne mostra 3".
- **Ricerca con nome e cognome insieme** (`userSearchWhere` in
  `apps/api/src/admin/admin-search.ts`): ogni parola deve stare in email,
  nome, cognome o attività, così "Vera Russo" trova Vera Russo.
- **Account chiusi ritrovabili** (collaudo, gruppo 12): alla chiusura si
  tiene un'impronta HMAC dell'email (`User.deletedEmailHash`, migrazione
  `20261030160000_impronta_email_chiusi`, chiave `FISCAL_DATA_KEY` come i dati
  fiscali), mai l'email. Scrivendo l'email esatta in Persone compare
  "Account chiuso" con la data. Domanda n. 85 per l'avvocato (informativa e
  per quanto tenerla).
- **I-08** (collaudo): "Pagamento ricevuto" compariva a chiunque aggiungesse
  `pagamento=completato` all'indirizzo. Ora la riga compare solo sulla propria
  richiesta e dice "Stiamo controllando il pagamento"; a pagamento confermato
  si apre già "Appuntamento prenotato".

Resta alla parte 3 (Protezioni): la finestra con cifra, motivo e conferma per
ruoli admin, DAC7, fatture, SdI e zone.

**Verifica:**

- Prova `e2e/tests/admin-persone.spec.ts` su telefono e computer: ricerca con
  nome e cognome, account chiuso ritrovato con l'email in maiuscolo senza
  mostrarla, segnali con il link alla gemella, stato "Terminato", recensione
  nascosta (prima senza motivo: errore) e rimessa visibile, profilo tolto
  dalla ricerca senza sospendere l'account e rimesso, Account sospetti, axe a
  0, nessuno scorrimento in orizzontale; I-08 sulla richiesta di un altro.
- Test unitari: `user-signals.test.ts` (telefono scritto in modi diversi,
  indirizzo senza civico, 48 ore, appuntamento, acconto) e la ricerca in
  `admin-search.test.ts`.
- Riprovate le altre prove admin e quelle che toccano le richieste del
  cliente (Da fare, due passaggi, andamento, conteggi, elimina richiesta,
  segnalazioni, stelle, preventivo accettato, menu laterale): tutte verdi.
