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
