# Oggi: "Ti stanno aspettando", "Lavori da chiudere" e "Tutto fatto"

**Richiesta** (Luca, 18/11/2026, thread "Decidere cosa mostrare in Oggi al
professionista"): in Oggi far vedere anche quando il professionista deve
mettersi d'accordo con un cliente in chat, e valutare da esperto cosa deve
comparire nella home. Scelte di Luca sull'elenco proposto: sì a richieste da
rispondere e date proposte (già c'erano), chat in attesa ("da valutare bene,
potrebbe fare spam"), lavori da chiudere, problemi segnalati, fatture chieste,
"Tutto fatto per oggi"; sì a unire date proposte e chat in una sezione sola.
No a recensioni da rispondere, sollecito sui preventivi senza risposta,
incassi in cima ed elenco delle notifiche.

**Decisione**:
- In cima, sotto "Da rispondere ora", una sola sezione **"Ti stanno
  aspettando"** con tutto quello in cui un cliente aspetta il professionista,
  ciascuna voce con una pillola che dice cos'è: prima i **problemi
  segnalati** che aspettano la sua risposta (in chat, la sua versione o le
  informazioni chieste dal nostro team, con la scadenza), poi le **date
  proposte** (prima "Date proposte dai clienti", PR #407), poi le **chat**
  in cui l'ultima parola è del cliente (chi aspetta da più tempo per primo),
  poi le **fatture chieste** a lavoro terminato. Da telefono 3 voci, dal
  computer 5, poi "Vedi tutte le N voci". Toglie la tessera "Messaggi non letti".
- **Contro lo spam** delle chat: una riga per chat anche con più messaggi
  ("3 messaggi"); solo messaggi scritti a mano dal cliente (non "ha accettato
  il preventivo"); qualunque evento del professionista, anche il preventivo
  inviato, vale come risposta; solo gli ultimi 14 giorni
  (`CHAT_AWAITING_DAYS`); solo lavori ancora vivi (niente richieste eliminate
  o ritirate, scadute o rifiutate, preventivi ritirati, lavori presi da un
  altro o annullati); niente doppioni con le altre righe; **"Non serve
  risposta"** toglie la chat finché il cliente non scrive di nuovo (tabella
  `chat_reply_dismissals`). Nessuna notifica in più.
- Fatture: **"Fatta"** la segna come fatta (colonna già esistente
  `client_invoice_requests.professionalSeenAt`, torna vuota se il cliente
  cambia i dati), con "Annulla" fino al prossimo caricamento. Chi lavora
  senza partita IVA vede "Ricevuta chiesta" e la voce sparisce quando scarica
  il PDF (torna se l'importo cambia).
- **"Lavori da chiudere"** sotto "Oggi e domani": appuntamenti confermati dei
  giorni passati non ancora chiusi, con "Lavoro terminato" che apre subito la
  finestra in agenda (`?booking=<id>&termina=1`). Quelli di oggi restano in
  "Oggi e domani", per non mostrarli due volte: lì, a fascia finita, "Lavoro
  terminato" prende il posto di "Naviga" e "Sto arrivando" (sì di Luca, stesso giorno). Con un problema aperto o un
  rimborso chiesto no: lo segue la riga del problema.
- **"Tutto fatto."** in verde in cima quando non c'è nulla da rispondere, da
  aspettare o da chiudere; prende il posto della riga vuota "Nessuna richiesta
  in attesa". Non a chi è appena iscritto (lì resta "Completa il profilo").

**Dove**: logica in `packages/shared/src/todayToDo.ts`; API
`GET /guided-requests/chat-threads/awaiting-reply`,
`POST /guided-requests/:id/no-reply-needed` (TimelineService),
`PUT /client-invoice-requests/booking/:bookingId/done`; pagina
`apps/web/src/app/dashboard/page.tsx`. Migrazione additiva
`20261118180000_chat_non_serve_risposta`.

**Verifica**: prove `todayToDo.test.ts` (10), `timeline-awaiting-reply.test.ts`
(4), prova nel browser `e2e/tests/oggi-ti-stanno-aspettando.spec.ts`
(problema, chat, fattura, lavoro da chiudere; "Non serve risposta" e "Fatta"
restano dopo il ricaricamento; la chat torna con un messaggio nuovo;
"Lavoro terminato" apre la finestra). Tutte le prove dell'API (1653) e di
`packages/shared` passate. Foto in `anteprime/oggi-ti-stanno-aspettando/`
nella cartella del progetto.
