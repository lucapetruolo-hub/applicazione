# Prove dei pagamenti con le chiavi di prova di Stripe

**Richiesta** (Luca, 28/10/2026): mettere le chiavi di prova di Stripe su
Render e controllare dal vero il percorso dei pagamenti (conto Express del
professionista, pagamento nel preventivo, acconto, rimborso, contestazione).

**Fatto prima del codice**: sandbox Stripe con IVA 22%, i 6 prezzi
dell'abbonamento, due webhook (account della piattaforma e account
collegati) e le 10 variabili `STRIPE_*` su Render. Guida in
`/mnt/project-files/analisi/stripe-prova/guida-chiavi-prova.md`.

## Conto del professionista sempre "da completare"

**Problema trovato**: finita l'iscrizione a Stripe, il professionista vedeva
ancora "Completa attivazione pagamenti online". Il sito rileggeva lo stato con
`v2.core.accounts.retrieve(..., { include: ["configuration.merchant", ...] })`
e Stripe rispondeva `Permission denied ... mconf_test_...`: con la Dashboard
Express, dopo l'iscrizione, la piattaforma non può più leggere le
configurazioni v2 dell'account. La lettura dell'account senza `include` e
con `include: ["requirements"]` invece funziona (provato dalla Stripe Shell:
requisiti vuoti, iscrizione riuscita). L'errore era nascosto da un
`.catch(() => undefined)`: lo stato restava fermo a prima dell'iscrizione.

**Decisione**: le capacità (`card_payments`, `transfers`) si leggono dalla
scheda v1 dell'account (`stripe.accounts.retrieve`), i requisiti dalle API v2
con il solo `include: ["requirements"]`
(`apps/api/src/professional-fiscal/stripe-connect-status.ts`). Il controllo
"ha già la configurazione merchant" usa `applied_configurations`. L'errore
della rilettura ora finisce nei log invece di sparire.

**Verifica**: test `stripe-connect-status.test.ts` (capacità dalla v1, solo
requisiti dalla v2, requisiti senza scadenza) e `stripe-disputes.test.ts`
aggiornato; test di `professional-fiscal`, `job-payments` e `billing` verdi,
`tsc` pulito. Dopo il deploy: la pagina Dati fiscali del professionista di
prova deve mostrare i pagamenti online attivi.
