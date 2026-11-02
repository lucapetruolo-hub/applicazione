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
  i dati dell'ultimo anno.
- **Controllo ogni mattina alle 7, salvato** (miglioria approvata da Luca il
  30/10/2026, `apps/api/src/admin/suspicious-accounts.service.ts`): il
  calcolo gira alle 7 (ora italiana) e salva segnali e data della prima
  volta in `suspicious_accounts`, l'ora dell'ultimo controllo in
  `suspicious_accounts_checks` (migrazione `20261101120000_account_sospetti`).
  Scheda e Account sospetti leggono il risultato salvato; "Controlla ora"
  (`POST /admin/suspicious-users/check`, solo moderatori) lo rifà subito.
- **Recensione tra due account con gli stessi dati**: nuovo segnale, su
  cliente e professionista, quando chi scrive la recensione ha lo stesso
  telefono, indirizzo o codice fiscale di chi la riceve. Le recensioni già
  nascoste non contano.
- **Persone → Account sospetti** (`/admin/account-sospetti`,
  `GET /admin/suspicious-users`, solo moderatori): in cima "Cosa fare", con
  il consiglio già scritto per ogni account che chiede un'azione e il link
  alla scheda giusta, così non serve aprirle tutte (richiesta di Luca del
  30/10/2026); sotto la tabella di tutti. Il consiglio
  (`adviseSuspiciousUser` in `packages/shared/src/adminSignals.ts`) vince il
  più urgente: "Da fare subito" per una recensione tra account con gli stessi
  dati (nascondila) e per lo stesso codice fiscale tra due professionisti;
  "Da guardare" per telefono o indirizzo uguale tra professionisti, lavoro
  chiuso prima dell'appuntamento e acconto del 100% di un professionista
  nuovo; "Nessuna azione" per clienti con gli stessi dati (di solito la
  stessa famiglia), cliente e professionista con gli stessi dati senza
  recensioni e recensione scritta presto. Lo stesso consiglio compare nella
  scheda con "Apri Recensioni" o "Apri Lavori". Il sito non decide niente da
  solo.
- **Avviso ai moderatori** (`ADMIN_SUSPICIOUS_ACCOUNTS`, sito ed email,
  argomento admin delle notifiche): dopo il controllo del mattino, una volta
  sola per account e solo se c'è qualcosa da fare (non per "Nessuna azione"),
  con l'elenco dei consigli.
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
  dalla ricerca senza sospendere l'account e rimesso, Account sospetti con
  "Controlla ora", "Cosa fare" (recensione tra account con lo stesso telefono
  da nascondere, famiglia senza azione) e link alla scheda Recensioni, axe a
  0, nessuno scorrimento in orizzontale; I-08 sulla richiesta di un altro.
- Test unitari: `user-signals.test.ts` (telefono scritto in modi diversi,
  indirizzo senza civico, 48 ore, appuntamento, acconto, recensione tra
  account con gli stessi dati, consigli e ordine), il modello dell'email
  dell'avviso e la ricerca in
  `admin-search.test.ts`.
- Riprovate le altre prove admin e quelle che toccano le richieste del
  cliente (Da fare, due passaggi, andamento, conteggi, elimina richiesta,
  segnalazioni, stelle, preventivo accettato, menu laterale): tutte verdi.

**Difetti delle librerie del 30/10/2026** (osv-scanner rosso su questa PR,
non causati da lei): joi passa alla 17.13.9, glob alla 14 e minimatch 10 alla
11 con `overrides` in `pnpm-workspace.yaml`; sono solo negli strumenti di
sviluppo (CLI di React Native ed Expo, ESLint, CLI di Nest). minimatch 3 non
ha una versione corretta ed è solo in ESLint (jsx-a11y) e fork-ts-checker:
eccezione con il motivo in `osv-scanner.toml`. Verificati lint, build
dell'API ed `expo export` di Android.

**Prove legate al calendario** (rosse su questa PR dal 31/10 e dal 1/11, non
causate da lei): la prova C2 dei tempi dell'agenda chiudeva venerdì 30/10 e il
server mostra solo i giorni chiusi da oggi in poi, ora chiude il venerdì della
settimana prossima. E un difetto vero dell'agenda sul telefono: la domenica,
aprendo un appuntamento da un link ("Vedi in agenda", `?booking=`), la
Settimana automatica portava alla settimana dopo, lontano dall'appuntamento;
ora con un appuntamento aperto dal link non scatta.

## Seguito del 02/11/2026: "Va bene così", coda della Home e controlli in più

**Richiesta** (Luca, 02/11/2026): "effettua le due migliorie e anche altri
aspetti di controllo automatizzati che farebbe un professionista di alto rango
in questo settore"; poi, sugli aggiornamenti: "sì, valuta come massimo esperto
come fare".

**Decisione:**

- **"Va bene così"** (`POST`/`DELETE /admin/suspicious-users/:id/dismiss`, solo
  moderatori, migrazione `20261102100000_account_sospetti_va_bene`): l'admin
  scrive perché (almeno 10 caratteri, va nel registro azioni) e l'account esce
  da "Cosa fare", dalla coda della Home e dagli avvisi. Torna da solo quando il
  controllo trova un segnale nuovo o un dettaglio cambiato (es. un messaggio in
  più): si confrontano le chiavi tipo|dettaglio salvate in `dismissedSignals`.
  Dalla scheda si toglie con "Togli Va bene così".
- **Coda "Da fare" della Home**: tipo `SUSPICIOUS_ACCOUNT` nel gruppo Persone,
  solo per "Da fare subito" e "Da guardare", con il consiglio e il link alla
  scheda giusta, "Prendo io" compreso.
- **Controlli in più** (`apps/api/src/admin/user-signals.ts`, consigli in
  `packages/shared/src/adminSignals.ts`), quelli tipici di chi si occupa di
  frodi in un marketplace:
  - *Stesso IBAN tra due professionisti* (IBAN decifrato solo nel controllo, mai
    salvato nei segnali): i soldi vanno alla stessa persona, "Da fare subito".
  - *Telefono, email, link o "WhatsApp" scritti in chat prima dell'accettazione*
    (lavoro portato fuori dal sito, e contro il principio dei contatti, CLAUDE.md
    §5.9): per il professionista "Da guardare", per il cliente nessuna azione. Un
    numero conta da 9 cifre, così date e prezzi no. Il testo non si salva, solo
    quanti messaggi e con chi.
  - *Iscritto con l'email di un account chiuso* (impronta HMAC): se quell'account
    era sospeso "Da fare subito" (si sta aggirando la sospensione), altrimenti
    nessuna azione.
  - *Email usa e getta* (elenco dei domini più usati): per il professionista "Da
    guardare" (fatture e avvisi non arrivano), per il cliente nessuna azione.
  - *Ondata di recensioni*: almeno 3 in 7 giorni da clienti iscritti da meno di
    30 giorni, "Da guardare".
  - *Problemi sul lavoro*: almeno 2 accolti contro un professionista o 2
    respinti a un cliente in 6 mesi (chi cerca rimborsi non dovuti), "Da guardare".
- **Aggiornamenti non coperti** da Dependabot e osv-scanner:
  `.github/workflows/aggiornamenti.yml` con `scripts/controlla-aggiornamenti.mjs`,
  il primo del mese: versioni nuove di React, React Native ed Expo (esclusi da
  Dependabot di proposito) e fine del supporto di Next.js, React, React Native e
  NestJS (endoflife.date) con 6 mesi di preavviso; ogni avviso apre una
  segnalazione su GitHub, una per titolo. Il primo giro segnala già Next.js 15,
  supportato fino al 31/01/2027. PostgreSQL di Render lo controlla l'API il primo
  del mese (`apps/api/src/admin/database-version.service.ts`): legge la versione
  dal database e, 6 mesi prima della fine del supporto, manda un'email ai super
  admin. Stripe è già coperto (nessuna versione dell'API fissata: cambia con il
  pacchetto `stripe`, che arriva da Dependabot), Google Maps usa "quarterly" che
  si aggiorna da sola.

**Verifica:** test unitari (IBAN con spazi, contatti sì/no, conteggio dei
messaggi, ritorno dopo sospensione, usa e getta con sottodominio, ondata 7 contro
20 giorni, problemi solo negli ultimi 6 mesi, "Va bene così" che si riapre,
versione di PostgreSQL), prova `admin-persone.spec.ts` su telefono e computer
("Va bene così" senza motivo: errore; poi fuori da "Cosa fare" e dalla Home,
"Togli" dalla scheda), `admin-da-fare.spec.ts` verde.
