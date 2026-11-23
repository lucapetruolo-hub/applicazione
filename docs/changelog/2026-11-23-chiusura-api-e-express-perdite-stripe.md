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

**Esito (23/11, 11:20)**: la prova **riesce**. Le chiavi limitate non
possono creare conti v2 (e Stripe ora rifiuta la creazione con le API v1),
quindi Luca ha lanciato la richiesta dalla Shell di Workbench della sua
sandbox, con `Stripe-Version: 2026-11-18.endive`: conto `acct_1UeuM6Q2mL6iBMcB`
creato, `dashboard: express`. Riletto dalla scheda v1: `controller.fees.payer
= application`, `controller.losses.payments = stripe`,
`stripe_dashboard.type = express`. Cioè: Express come oggi, la nostra
trattenuta come oggi, i saldi negativi non recuperabili a carico di Stripe
("Managed Risk").

Condizioni di Stripe per il Managed Risk, tutte già vere da noi tranne una:
addebito diretto (sì, §268), capacità `card_payments` (sì), iscrizione sulla
pagina di Stripe (sì, link v2), Dashboard Express per rispondere a Stripe
(sì), **Radar acceso per i conti collegati** (da controllare in Dashboard).
Con il listino standard di Stripe non costa nulla in più. Stripe in cambio può
rallentare i bonifici, tenere una riserva o chiudere un conto rischioso.

Per usarlo nel sito serve `stripe` 23.2.0 (la prima che parla l'API
`2026-11-18.endive`, uscita il 19/11) e `losses_collector: "stripe"` alla
creazione del conto in `professional-fiscal.service.ts`. Vale solo per i conti
nuovi: le responsabilità non si cambiano dopo (al lancio, con le chiavi vere,
i conti sono comunque tutti nuovi). Se togliere anche il tetto di 2.000 € lo
decide Luca.
