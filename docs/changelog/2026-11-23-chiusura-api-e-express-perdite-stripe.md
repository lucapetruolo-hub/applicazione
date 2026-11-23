# Chiusura dell'API ai riavvii e prova di Express con le perdite a carico di Stripe

**Richiesta** (Luca, 23/11/2026, "si" alle due migliorie proposte dopo
`2026-11-20-stripe-23-nestjs-12.md`): 1) l'API deve chiudersi da sola quando
Render la riavvia; 2) provare nella sandbox se i conti Express possono avere
le perdite a carico di Stripe, per capire se si può togliere il tetto di
2.000 € per i professionisti nuovi.

## 1. Chiusura dell'API

**Problema** (già presente con NestJS 11, provato il 20/11): a ogni deploy
Render manda SIGTERM. Nest chiude il server HTTP aspettando che finiscano le
richieste aperte, ma i flussi in tempo reale (`GET /realtime/stream`) non
finiscono mai da soli: con anche una sola persona sul sito l'API restava
accesa finché Render non la spegneva di forza dopo 30 secondi.

**Decisione**: `RealtimeService.closing$` emette alla chiusura
(`onModuleDestroy`, che Nest chiama prima di chiudere il server HTTP) e ogni
flusso si chiude con lui (`takeUntil` in `realtime.controller.ts`). Il
browser si ricollega da solo alla copia nuova (con un biglietto nuovo, come
già succede quando la connessione cade). Scartato `forceCloseConnections` di
Nest: taglierebbe anche le richieste normali ancora in corso (un pagamento,
un salvataggio).

**Verifica**: test nuovo in `realtime.service.test.ts`; API vera con Postgres,
flusso aperto e ping arrivato, SIGTERM: chiusa in 1 secondo (prima ancora
accesa dopo 45 secondi).

## 2. Express con perdite a carico di Stripe

Novità di Stripe del 18/11/2026 (API `2026-11-18.endive`): un conto Express
può avere `losses_collector: "stripe"` con `fees_collector: "application"`,
solo con l'addebito diretto (il nostro, §268). Le responsabilità si scelgono
alla creazione del conto e non si cambiano dopo. Il 28/10 la stessa
richiesta dava `account_express_dashboard_with_stripe_loss_liable`
(`analisi/stripe-prova/standard-o-express.md`).

**Stato**: prova non ancora fatta. La chiave di prova di questo ambiente
(`STRIPE_READONLY_TEST_KEY`, sandbox di Luca) non può creare conti
("Accounts Write" mancante). Serve il permesso sulla chiave, poi la prova si
rifà con la stessa richiesta di `professional-fiscal.service.ts`.
