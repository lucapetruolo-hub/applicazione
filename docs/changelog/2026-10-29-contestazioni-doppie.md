# Contestazioni in banca: avvisi e rimborsi una volta sola

## Richiesta

Prova dal vivo del 29/10 della contestazione vinta (70 €, Stripe di prova):
Stripe l'ha chiusa come vinta in 4 secondi, ma al professionista sono
arrivati due avvisi "contestazione chiusa" a 2 secondi l'uno dall'altro.
Luca vuole il sito pronto al lancio, quindi il difetto si corregge subito.

## Causa

Alla chiusura Stripe manda più notizie quasi insieme (`charge.dispute.closed`
e `charge.dispute.funds_reinstated`, o `funds_withdrawn`). Ognuna leggeva il
pagamento ancora aperto e lo trattava come "appena chiuso": avvisi doppi a
professionista e team e, con una contestazione persa, rimborso e debito
contati due volte. Una notizia arrivata dopo poteva anche riscrivere il
rimborso con il valore letto prima.

## Decisione

In `OnlineMoneyService.handleStripeDispute` apertura e chiusura si
"prenotano" con un aggiornamento condizionato (`updateMany` su
`stripeDisputeId: null` e sugli stati non chiusi): solo la notizia che ci
riesce manda gli avvisi, scrive il rimborso e recupera il debito. Le altre
aggiornano solo i dati della contestazione. Una notizia in ritardo con uno
stato aperto non riapre una contestazione già chiusa.

## Verifica

`stripe-disputes.test.ts`: due chiusure quasi insieme danno un avviso e un
rimborso; una notizia in ritardo non cambia nulla; il secondo passaggio non
riscrive il rimborso. Tutti i test dell'API (921), `tsc`, eslint.

## Prova dell'agenda con date fisse

Nella CI di questa PR si è rotta `e2e/tests/settimana-tipo.spec.ts` ("un
giorno cambiato a mano mostra eccezione"): usava mercoledì 28 e giovedì 29
ottobre 2026, che dal 29/10 sono nel passato, e il server non riempie più
quei giorni dalla settimana tipo. Ora la prova sceglie il primo mercoledì ad
almeno 3 giorni da oggi e il giovedì dopo, e ferma l'orologio della pagina
al sabato prima. Non c'entra con le contestazioni: si sarebbe rotta in ogni
PR da oggi.
