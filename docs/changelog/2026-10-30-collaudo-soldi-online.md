# Collaudo, gruppo 1: soldi online e rimborsi

## Richiesta

Luca ha chiesto di fare tutti i gruppi di correzione del collaudo del 29/10
(`/mnt/project-files/collaudo/2026-10-29/riepilogo.md`, piano in
`piano-correzioni.md`). Questo è il gruppo 1, i soldi online e i rimborsi,
con i rilievi del thread sul riordino dell'Admin che toccano gli stessi
punti.

## Decisione

Pagamenti del cliente:

- **I-02** Pagamento doppio dell'acconto: la pagina di pagamento è una sola
  per preventivo (`Quote.depositCheckoutSessionId`, riusata se cifra, modo e
  cliente sono gli stessi). Un secondo pagamento arrivato comunque viene
  registrato una volta sola e rimborsato subito, con l'email "avevi pagato due
  volte".
- **I-01** Acconto sotto 50 centesimi (minimo di Stripe): il preventivo non
  lo offre online e la conferma lo rifiuta.
- **F-01** "Lavoro terminato" solo dal giorno dell'appuntamento, per
  professionista e cliente (come l'Agenda, §311).
- **F-04, F-02, P-05** Cifre giuste prima del bonifico (trattenuta in
  proporzione a quanto pagato); la parte pagata in più del prezzo finale
  torna subito al cliente alla chiusura.
- **F-06, F-09** Testi: la chiusura dice quanto paga il cliente e quanto
  arriva al professionista; un annullamento dice quanto torna; con una
  segnalazione o una contestazione in banca aperte i soldi si dicono "fermi".
- **F-08** Un appuntamento annullato non si riapre se è già passato o se
  l'orario è stato preso.

Segnalazioni:

- **F-03** Rimborso concordato in chat: il professionista propone una cifra,
  il cliente la accetta con un tocco, il rimborso parte da Stripe e la
  segnalazione si chiude.
- **F-20** Le righe automatiche della chat non contano come risposta del
  professionista; la proposta di rimborso sì.
- Quando una segnalazione passa al nostro team o arriva un ricorso, gli admin
  ricevono un avviso. Con un solo admin il ricorso lo può decidere lui.

Admin (riordino):

- Rimborsi: la conferma è una finestra con cifra, nome del cliente e del
  professionista, motivo obbligatorio e pulsante col nome dell'azione
  ("Rimborsa 50 €"). Il rifiuto arriva a chi l'aveva chiesto col motivo
  (`JOB_REFUND_REJECTED`). Se Stripe sbaglia dopo "Approva" il rimborso torna
  da decidere; due tocchi insieme rimborsano una volta sola.
- Segnalazioni: le percentuali di rimborso mostrano anche gli euro;
  "Accogli" e "Respingi" chiedono conferma in una finestra che dice misura,
  rimborso in euro e a chi. La finestra (`CancelBookingModal` con
  `noteMinLength`) è quella da riusare per le altre azioni pericolose
  dell'Admin.
- La scadenza delle prove di una contestazione in banca è in evidenza sulla
  scheda da preparare (in rosso negli ultimi 3 giorni).
- "Pagamenti online" del professionista: i soldi contestati in banca non sono
  più tra i "Bloccati" (come nell'estratto del gruppo 2) e compaiono a parte.

Migliorie approvate da Luca il 30/10:

- **P-02** (decisione di Luca, "solo il totale"): finché vale il tetto dei
  professionisti nuovi, al massimo 3.000 € online fermi in tutto
  (`ONLINE_HELD_LIMIT_EUR_CENTS`, pagati e non ancora sbloccati). Si
  controlla sugli acconti, all'inizio di un lavoro: il saldo di un lavoro già
  iniziato passa sempre. Oltre, il cliente legge di scegliere il pagamento
  diretto o riprovare tra qualche giorno. Nessun limite sulla percentuale
  dell'anticipo.
- Chi paga online tutto il massimo accettando legge che i soldi restano fermi
  fino alla sua conferma e che la differenza gli torna.
- **F-08** Un appuntamento annullato non torna più valido da solo: chi l'ha
  annullato "chiede di riaprire", l'altro accetta o rifiuta dalla scheda
  (`Booking.reopenRequestedAt/By`, avvisi `BOOKING_REOPEN_REQUESTED` e
  `BOOKING_REOPEN_DECLINED`). I controlli (orario passato, fascia libera,
  altro lavoro sulla stessa richiesta) si rifanno all'accettazione.

- **P-04** (decisione di Luca, regola di Upwork e Fiverr): un lavoro fatto
  male si segnala entro 7 giorni (prima 14) dall'ultimo tra fine
  dell'appuntamento e chiusura del professionista, e solo finché il cliente
  non conferma "Lavoro terminato", che vale come accettazione del lavoro.
  Così si segnala solo mentre i soldi online sono fermi (7 giorni) e un
  rimborso non resta mai a carico nostro. Lo stesso termine vale per la
  chiusura d'ufficio quando una parte non risponde (promemoria al 3° e al 6°
  giorno, chiusura al 7°), anche per il professionista che non segna il
  lavoro come terminato. Testi aggiornati: finestra di conferma del cliente,
  "Segnala un problema", "E se…" in home, Termini punto 6 (e il tetto dei
  3.000 € al punto dei pagamenti). Domanda 84 per l'avvocato.

- **Segnalazione dopo il termine** (decisione di Luca del 30/10): passati i 7
  giorni o dopo "Lavoro terminato" il cliente può ancora segnalare un lavoro
  non andato bene per 2 anni (`JOB_ISSUE_LATE_DAYS`, `JobIssue.late`). Resta
  tra le parti come con il pagamento diretto (`jobIssueAssisted`): chat con il
  professionista, niente rimborso né team, una riga sulla garanzia di legge
  (`JOB_ISSUE_LATE_NOTE`); chiusa la segnalazione il cliente può recensire.
  In Admin → Problemi si vedono le segnalazioni a lavoro chiuso finite senza
  accordo nell'ultimo anno (in rosso da 3). La formula del punteggio di
  affidabilità non cambia: una segnalazione non decisa potrebbe essere falsa.
  Termini punto 6. Nella finestra "Segnala un problema" (richiesta di Luca)
  una frase e "Scopri di più": perché niente rimborso, cosa fare con il
  professionista, la garanzia di legge e le vie se non vi accordate; nel menu
  la voce dice "Senza rimborso, in chat con il professionista".

- **Pagina "Problemi e rimborsi"** (`/problemi-e-rimborsi`, richiesta di Luca:
  le spiegazioni in una pagina sola, non nella finestra): cosa succede in
  ordine di tempo (annullare, non si presenta, nei 7 giorni, dopo i 7 giorni,
  pagamento diretto, banca), con le ancore. Ci portano il piede del sito,
  "Scopri di più" nelle Domande frequenti (una domanda nuova sul dopo i 7
  giorni) e la finestra "Segnala un problema", che ora ha una frase e il link
  (in una nuova scheda, per non perdere quanto scritto). I Termini restano il
  testo che vale.
- **Recensioni** (decisioni di Luca): il professionista risponde pubblicamente
  sotto ogni recensione dal suo profilo pubblico e può modificare la risposta
  (`Review.professionalReply`, `PUT /reviews/:id/reply`); l'email della nuova
  recensione lo dice. Il cliente aggiorna la recensione una sola volta, voto
  compreso, dopo una segnalazione a lavoro chiuso finita senza accordo
  (`Review.updatedAfterIssueAt`, `PATCH /reviews/:id`, `clientCanUpdateReview`):
  la media si ricalcola, il professionista riceve l'avviso con il link alla
  recensione e sotto compare "Aggiornata il … dopo una segnalazione a lavoro
  chiuso". Termini (recensioni) e cronologia dei Termini aggiornati.
- **Migliorie sulle recensioni** (Luca: "da esperto del settore"): pagina
  "Recensioni" nell'area del professionista (`/dashboard/recensioni`, voce in
  "La tua attività", `GET /reviews/received`) con media, filtro "Da
  rispondere" e "Rispondi" accanto a ognuna, anche quelle nascoste segnate
  come tali; l'email e la notifica della nuova recensione portano lì. Il
  cliente riceve l'avviso `REVIEW_REPLIED` alla prima risposta (non a ogni
  correzione) e legge la risposta in "Le mie recensioni".

F-21 e G-14 (cifre dei bonifici): servono i dati di Stripe.

## Verifica

Test nuovi: `issue-refund-agreement.test.ts`, `refund-decision.test.ts`,
`job-issue-chat-reply.test.ts`, `online-held-limit.test.ts`, `reopen-request.test.ts` e casi in `online-limit-completion`,
`destination-charges`, `direct-charges`, `online-payments`. Tutta la suite
API, typecheck del sito e `pnpm lint` passano.
