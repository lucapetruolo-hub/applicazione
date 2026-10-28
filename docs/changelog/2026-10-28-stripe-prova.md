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

## Migliorie (Luca: "Effettua le migliorie")

1. **Iscrizione a Stripe precompilata**
   (`apps/api/src/professional-fiscal/stripe-account-prefill.ts`): alla
   creazione del conto si mandano i dati già dati sul sito. Persona: nome,
   cognome, data di nascita, indirizzo, email, telefono (solo se in formato
   +39...), codice fiscale (`it_cf`). Azienda: ragione sociale, sede,
   telefono, partita IVA (`it_vat`). Per tutti: codice dell'attività (MCC)
   dalla categoria principale, link al profilo pubblico come sito, nome
   dell'attività e una descrizione fatta dal sito ("Idraulico a Latina:
   interventi richiesti e pagati tramite ..."), non la bio. Requisiti
   ufficiali e confronto in
   `/mnt/project-files/analisi/stripe-prova/dati-da-precompilare.md`.
   Restano a Stripe nazionalità, IBAN (con Express lo raccoglie Stripe),
   accettazione dei termini e, per le aziende, titolari e amministratori.
   Se Stripe rifiuta un dato precompilato il conto si crea comunque senza
   (chiave di idempotenza diversa), con un avviso nei log.
2. **Avviso agli admin quando lo stato del conto non si rilegge**: nuova
   notifica `ADMIN_STRIPE_ACCOUNT_UNREADABLE` (sito ed email, Finanza e
   super admin, argomento dei pagamenti dei lavori), al massimo una volta al
   giorno per conto.
3. **"Via Roma 10, Latina" rifiutato**: controllato, non è un errore. Nel
   comune di Latina non c'è una Via Roma: i suggerimenti di Google
   propongono quella di Cisterna di Latina, Roccasecca dei Volsci, ecc., e
   il codice postale di Via Roma a Latina non esiste.
4. **Checklist di lancio**: passaggio dalle chiavi di prova a quelle vere,
   azzeramento degli ID Stripe di prova nel database, correzione della
   motivazione nel profilo della piattaforma.

**Verifica**: `stripe-account-prefill.test.ts` (persona, dati mancanti,
azienda) e il nuovo caso in `stripe-account-notifications.test.ts`; tutti i
test dell'API (878) verdi e `tsc` pulito.
