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
   cognome, data di nascita, indirizzo, email, telefono, codice fiscale (`it_cf`). Azienda: ragione sociale, sede,
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

## Telefono anche senza "+" (miglioria 2, richiesta di Luca)

Il sito chiede già il prefisso del paese e salva "+39 3331234567", ma con lo
spazio, e i numeri salvati prima del §214 possono non avere il prefisso: con
il controllo "solo se inizia con +" questi non arrivavano a Stripe. Ora il
numero passa da `normalizePhoneNumber` (senza prefisso vuol dire italiano,
come nel resto del sito) e va a Stripe senza spazi ("+393331234567"); un
numero non plausibile resta fuori e lo chiede Stripe. Nessun cambio al
modulo del sito. Verifica: due casi nuovi in `stripe-account-prefill.test.ts`.

## Telefono controllato con le regole di ogni paese (miglioria 1, approvata da Luca)

Nuova dipendenza `libphonenumber-js` (solo in `apps/api`, approvata da
Luca il 28/10). Il telefono si manda a Stripe solo se è valido per le
regole di numerazione del suo paese. Alla persona va solo un cellulare,
perché Stripe può usarlo per mandare un codice via SMS; per l'azienda va
bene anche un fisso. Verifica: un caso nuovo in
`stripe-account-prefill.test.ts` (fisso di Latina, prefisso inesistente) e
la build dell'API che carica la libreria da `dist/`.

## Prove dal vivo con gli account di prova (28/10, dopo "ok express")

Luca ha scelto di restare su Express con le perdite a carico nostro: Stripe
non permette Express con le perdite a carico suo (errore
`account_express_dashboard_with_stripe_loss_liable`). Prove sul sito vero,
con le chiavi di prova e gli account `prova.design.*`:

- tetto: rifiutati un preventivo di 2.500 € tutto online e una chiusura a
  2.100 €;
- acconto di 50 € pagato e rimborsato per intero all'annullamento;
- lavoro tutto online: acconto, saldo addebitato da solo sulla carta,
  conferma del cliente, sblocco e bonifico di 201,21 € (220 € meno 7% + IVA);
- link "Apri Stripe" del professionista funzionante.

Due correzioni nate dalle prove:

1. **Contestazione arrivata prima del pagamento**: con la carta di prova
   0259 Stripe ha mandato `charge.dispute.created` 2 secondi prima della
   conferma del pagamento; il sito non trovava il lavoro, lo trattava come
   un abbonamento e non avvisava il professionista finché non arrivava un
   aggiornamento. Ora una contestazione sul conto di un professionista
   (`event.account`) senza lavoro risponde con un errore e Stripe la rimanda
   più tardi; lo stesso per `funds_withdrawn`/`funds_reinstated`.
2. **Sempre in euro**: il browser della prova risultava negli Stati Uniti e
   Stripe (Adaptive Pricing) ha fatto pagare in dollari; la contestazione è
   arrivata come 48,08 €. Tutti i Checkout (lavori, abbonamento, quota di
   passaggio, pacchetti) hanno `adaptive_pricing: { enabled: false }`
   (`EUR_ONLY`), così importi, rimborsi e contestazioni restano in euro.

**Verifica**: caso nuovo in `billing-webhook.test.ts` (contestazione
rimandata) e in `direct-charges.test.ts` (Checkout in euro); tutti i test
dell'API (898) e `tsc`.

## Migliorie: Adaptive Pricing in checklist e prove delle contestazioni dal sito

Richiesta di Luca ("effettua le due migliorie": il sito va pronto per il
lancio, non per i numeri di oggi):

1. **Checklist di lancio**: spegnere l'Adaptive Pricing anche nelle
   impostazioni di Stripe (seconda sicurezza oltre a `EUR_ONLY`); la chiave
   limitata `rk_` deve poter scrivere contestazioni e file degli account
   collegati.
2. **Contestazioni in banca da Admin → Pagamenti**
   (`BankDisputesService`, `GET/PATCH /admin/bank-disputes`, scope FINANCE):
   elenco delle contestazioni aperte con importo, motivo in parole semplici
   e scadenza letti da Stripe; prove già scritte dal sito (lavoro, cliente,
   giorno, spiegazione con richiesta, pagamento, appuntamento, chiusura,
   conferma del cliente, segnalazioni); un PDF "Riepilogo del lavoro" (date,
   richiesta, preventivo, pagamenti, voci finali e gli ultimi 80 messaggi
   tra cliente e professionista) caricato su Stripe come documentazione del
   servizio. "Salva senza mandare" o "Manda alla banca" con conferma: dopo
   l'invio le prove non si cambiano più. Tutto sul conto del professionista
   (addebito diretto) e nel registro azioni.

**Verifica**: `bank-disputes.test.ts` (elenco e bozza, invio con PDF sul
conto giusto, prove già consegnate, messaggi nel PDF, testi); PDF
controllato a occhio; tutti i test dell'API, `tsc` di API e sito, `pnpm lint`.
