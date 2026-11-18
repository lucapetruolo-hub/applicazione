# Bacheca "Lavori cercati": interruttore del cliente, Privacy e Termini, numero in /cerca, richieste più vicine e misure in Admin (PR 3 di 3)

**Richiesta (Luca, 17-18/11/2026):** ultima parte della bacheca
(`docs/changelog/2026-11-17-bacheca-lavori-cercati.md`, #396, e
`2026-11-17-bacheca-rispondi.md`, #398 e #399). Decisioni già prese da Luca:
interruttore del cliente acceso di serie con "Togli dai lavori cercati"
(decisione 4), numero di richieste nelle pagine /cerca solo da una soglia
("altrimenti sembrano poche", decisione 10, soglia 10 al mese per provincia),
e il "sì" del 18/11 a proporre le richieste più vicine a chi tocca "Rispondi"
oltre i 100 km.

**Cosa cambia**
- *Interruttore del cliente.* Nel riepilogo della richiesta guidata un
  interruttore "Mostra in Lavori cercati", acceso di serie
  (`boardAllowed` in `guidedRequestSchema`, salvato come
  `GuidedRequest.boardOptOut`). Non compare per la richiesta a un
  professionista scelto e per l'urgente, che non vanno in bacheca. Il testo
  dice quando si vede: subito per un lavoro che nessuno fa ancora vicino al
  cliente, dopo 2 giorni senza preventivi per gli altri. In "Le mie
  richieste" il menu della scheda ha "Togli dai lavori cercati" / "Mostra in
  Lavori cercati" (`PATCH /guided-requests/:id/board`, solo il cliente della
  richiesta). Una richiesta rimandata dopo una segnalazione conserva la
  scelta.
- *Privacy e Termini* (18 novembre 2026): nella Privacy due finalità nuove,
  la bacheca (riassunto anonimo scritto con Claude di Anthropic, solo
  mestiere, comune o provincia e testo senza dati personali, mai foto, via o
  contatti) e "Avvisami" (email data con il consenso, usata una volta sola e
  poi cancellata, al massimo 180 giorni), con la riga nei tempi di
  conservazione. Nei Termini (sezioni 3 e 4) la bacheca, l'interruttore e il
  limite di 5 preventivi. `termsChanges.ts` versione `2026-11-18`, senza
  avviso agli utenti prima del lancio.
- *Frasi vietate:* `controlla-frasi-intermediario.mjs` ferma anche "lavori
  disponibili", "incarichi disponibili/da prendere/assegnati", "turni di
  lavoro", "offerte di lavoro": la bacheca mostra richieste di preventivo, non
  lavori da assegnare (CLAUDE.md §5 punto 18).
- *Numero in /cerca:* `GET /request-board/demand?categoria=&provincia=` conta
  le richieste degli ultimi 30 giorni per quel mestiere nei comuni della
  provincia, dal lancio e senza account di prova (§5 punto 17); sotto 10
  (`BOARD_CLIENT_COUNT_MIN`) risponde `null` e la pagina non mostra nulla.
  Da 10 in su la scheda dei numeri della città ha "N richieste questo mese in
  provincia di X".
- *Richieste più vicine:* se "Rispondi" trova la richiesta oltre 100 km,
  `/rispondi` mostra fino a 3 richieste dello stesso mestiere entro 100 km
  dalla zona del professionista, le più vicine prima.
- *Misure in Admin* ("Richieste in attesa"): riquadro "Lavori cercati" con le
  richieste in bacheca adesso, le risposte con "Rispondi" e i preventivi che
  ne sono nati, le richieste tenute da parte, chi aspetta "Avvisami" e quante
  ne ha tolte il cliente. Solo numeri, mai contatti. Le regole di "in bacheca
  adesso" sono le stesse della pagina pubblica (`boardListedWhere` in
  `board-rules.ts`).

**Migliorie ("sì" di Luca del 18/11, stessa PR)**
- *Riga per il cliente:* nella scheda in "Le mie richieste", finché la
  richiesta è in bacheca, "La vedono anche i professionisti non ancora
  iscritti, senza nome, foto e indirizzo."
- *Lavori cercati della settimana:* il lunedì alle 9 (`sendWeeklyDigest`,
  `@ScheduledJob`) un'email a ogni professionista visibile con le richieste
  entrate in bacheca negli ultimi 7 giorni a cui può rispondere (stesse
  regole di "Rispondi": mestiere ed entro 100 km) e che non gli sono
  arrivate, le più vicine prima, al massimo 5 con il link a `/rispondi`.
  Nessuna email se non ce n'è. Tipo `BOARD_WEEKLY_DIGEST`, avviso
  "Lavori cercati della settimana" solo email nelle Notifiche, con "Non
  ricevere più email come questa" (`NotificationsService.sendOwnEmail`).
  Spenta finché `REQUEST_BOARD_ENABLED` non è `true`.

**Motivo:** la bacheca si accende (`REQUEST_BOARD_ENABLED=true` su Render)
solo con il cliente libero di toglierla, i testi legali aggiornati e un modo
per vedere se porta preventivi.

**Verifica:** typecheck di API e sito, `pnpm lint` (anche frasi vietate),
`request-board-client.test.ts` (soglia del numero, provincia sconosciuta,
richieste più vicine al massimo 3 ed entro 100 km, interruttore solo del
proprio cliente, email della settimana solo a chi fa il mestiere entro 100 km
e mai per una richiesta già ricevuta), prove della bacheca e dei termini già esistenti.

**Dopo l'unione:** Luca imposta `REQUEST_BOARD_ENABLED=true` su Render per
accendere il giro orario.
