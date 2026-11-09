# Lavori e pagamenti: le strade secondarie dell'API (collaudo 08/11, gruppo 3)

**Richiesta**: Luca, 08/11/2026, "sì a tutto quello che ritieni" sul
controllo prima del lancio (`collaudo/2026-11-08/riepilogo.md`, gruppo 3):
E1-02, E1-03, E3-04, E3-06, più le migliorie "sì" del tema.

## E1-02 "Accetta nuova data" faceva nascere il lavoro senza pagamento

Prima, quando il cliente proponeva un'altra data prima di accettare e il
professionista toccava "Accetta nuova data", il lavoro nasceva subito: senza
la scelta del pagamento, senza acconto online, senza la riga del pagamento
(quindi senza trattenuta) e senza la fattura chiesta dal cliente.

**Decisione**: "Accetta nuova data" ora rimette il preventivo "inviato" con
la data del cliente (`Quote.proposedDateAcceptedAt`, migrazione
`20261109140000_data_proposta_accettata`). Il cliente vede "Il professionista
ha accettato la data che hai proposto: accetta il preventivo per fissare
l'appuntamento" e accetta come sempre, scegliendo come pagare. Una sola
strada per far nascere un lavoro, quella normale. La fascia si controlla
subito (al professionista) e di nuovo all'accettazione (come per ogni
preventivo). Il pulsante "Conferma appuntamento" (proposte vecchie con la
stessa data) diventa "Accetta la data"; sotto i pulsanti una riga "Poi il
cliente accetta il preventivo con quella data." Un errore (fascia occupata)
ora si vede sotto i pulsanti, prima si perdeva.
Lo spostamento di un appuntamento già fissato ("Non posso più") non cambia.

## E1-03 `PATCH /bookings/:id/status` chiudeva il lavoro senza controlli

Accettava COMPLETED e NO_SHOW: un professionista con una chiamata diretta
poteva chiudere un lavoro futuro senza importo, dichiarazione DAC7 né saldo
online, e dopo 7 giorni il lavoro si confermava da solo.
**Decisione**: solo CONFIRMED e CANCELED, nel controllo dell'indirizzo e nel
servizio; il lavoro si chiude solo con "Lavoro terminato".

## E3-04 La rotta del pagamento dava la riga intera

`GET /bookings/:id/job-payment` restituiva la riga del database: al cliente
la difesa del professionista nella contestazione e gli id Stripe, al
professionista gli id della carta del cliente. Ora restituisce lo stesso
riepilogo delle schede (`toJobPaymentSummary`), con le voci da professionista
solo al professionista.

## E3-06 Acconto pagato, lavoro mai nato se il webhook non arriva

Il lavoro nasceva solo dal webhook del conto del professionista. Ora:
- al ritorno dal pagamento il sito chiama
  `POST /bookings/from-quote/:quoteId/verify-deposit` (il preventivo è
  nell'indirizzo di ritorno): l'API legge la pagina di Stripe e, se è pagata
  e non rimborsata, fa nascere il lavoro con la stessa `confirmQuoteDeposit`
  del webhook;
- ogni ora `MissedDepositsService` ripassa gli acconti pagati degli ultimi 3
  giorni senza lavoro (tranne gli ultimi 10 minuti, il webhook è in arrivo) e
  manda un avviso su Sentry: vuol dire che l'endpoint Connect non riceve.
- Webhook e ritorno arrivano quasi insieme: se intanto lo stesso pagamento ha
  fatto nascere il lavoro online del cliente, si registra lì e non si
  rimborsa mai (prima, nel millisecondo tra lavoro creato e pagamento
  registrato, un secondo avviso avrebbe rimborsato l'acconto giusto).

## Migliorie "sì" del tema

- Totale del preventivo nell'email "Nuovo preventivo" ("€120" o "da €100 a
  €150"; niente se tutte le voci sono "Su richiesta").
- `isDemo: false` nello smistamento delle richieste (`matchProfilesForFanOut`).

**Verifica**: test nuovi in `bookings.service.test.ts` (acconto senza
webhook, doppia conferma, stato), `quotes/proposed-date-accepted.test.ts`,
`job-payments/job-payment-summary-route.test.ts`, `email-templates.test.ts`;
1302 test dell'API, lint e typecheck verdi.
