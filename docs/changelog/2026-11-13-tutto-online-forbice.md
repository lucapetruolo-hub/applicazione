# Tutto online con la forbice di prezzo: il minimo subito, il resto a fine lavoro

**Richiesta** (Luca, 13/11/2026, thread "Correggere l'avviso di annullamento
con data passata"): scelta "Il minimo, il resto a fine lavoro" sulla domanda
del costo dei rimborsi (analisi `analisi/annullamento-acconto/commissioni-stripe.md`
nella cartella condivisa).

**Problema**: con "tutto online" (acconto al 100%) e una forbice di prezzo il
cliente pagava subito il massimo e la differenza tornava a fine lavoro. Stripe
non restituisce la sua commissione sulla parte rimborsata: con 1.150 € pagati e
250 € di prezzo finale il professionista perdeva circa 13,50 € senza saperlo.

**Decisione**:
- `quoteDepositEurCents()` in `packages/shared/src/onlinePayments.ts`: al 100%
  con una forbice (minimo sopra 0 e sotto il massimo) si paga il **prezzo
  minimo**; negli altri casi come prima (percentuale del massimo).
- Il resto passa dal percorso già esistente "acconto + saldo online" (§267):
  carta salvata e saldo in automatico quando il professionista chiude il
  lavoro, solo se il prezzo finale è più alto del minimo. Nessun codice nuovo
  per il pagamento: cambia solo l'importo dell'acconto (pagina di pagamento,
  controllo dell'importo al ritorno da Stripe, `JobPayment.depositEurCents`).
- Testi: "250,00 € adesso con la carta, il prezzo minimo. Il resto (fino a
  900,00 €) a lavoro finito con la stessa carta, solo se il prezzo finale è più
  alto"; nel riepilogo prima di Accetta "Il prezzo minimo, con carta"; nel
  modulo del preventivo una riga per il professionista. Il resto con minimo 0
  si scrive "fino a X".
- Preventivi già inviati: valgono le regole nuove dal prossimo "Accetta"
  (l'importo si calcola sempre al momento).

**Verifica**: `packages/shared/src/quotePaymentSplit.test.ts` (minimo, prezzo
unico, percentuale, solo massimo), `apps/api/src/bookings/bookings.service.test.ts`
(pagina di pagamento col minimo, lavoro creato al ritorno da Stripe senza
rimborso); typecheck, eslint, prove dell'API. Non c'è ancora una prova con
Stripe in modalità di prova per i pagamenti dei lavori (solo per l'iscrizione
con carta).

## Secondo giro: 48 ore per dire di no sul prezzo finale

**Richiesta** (Luca, 13/11/2026): "e se poi il professionista spara un prezzo
non concordato?". Sopra il massimo o con voci nuove non c'era già addebito
automatico (motivo obbligatorio, il cliente paga col link); dentro la forbice
invece il resto partiva subito dalla carta. Luca ha scelto (scheda) "48 ore per
dire di no".

**Decisione**:
- Prezzo finale sopra il minimo del preventivo (`balanceChargeWaitsForClient`,
  `BALANCE_AUTO_CHARGE_WAIT_HOURS = 48` in `packages/shared/src/onlinePayments.ts`):
  alla chiusura il saldo non si addebita, si salva `JobPayment.balanceAutoChargeAt`
  (migrazione `20261113200000_saldo_dopo_48_ore`).
- Cliente: notifica ed email "Controlla il prezzo finale" con data e ora
  dell'addebito. "Va bene" = non fare nulla o confermare "Lavoro terminato"
  (addebito subito); "Non sono d'accordo" = "Segnala un problema": la data si
  azzera e non parte nulla. Nella scheda del pagamento sparisce "Paga il saldo"
  mentre si aspetta. Il professionista legge che il cliente ha 48 ore.
- Allo scadere: `OnlineMoneyService.runHeldBalanceCharges` (ogni ora) addebita la
  carta salvata; una sola volta anche con due giri (la data si azzera prima di
  addebitare); con la carta rifiutata il cliente riceve il link, come prima.
- Al minimo o sotto: addebito subito come prima. Cliente che aveva già
  confermato "Lavoro terminato" (non può più segnalare): addebito subito.
- Testo sulla pagina di Stripe dove si salva la carta: aggiunte le 48 ore.

**Verifica**: `destination-charges.test.ts` (attesa alla chiusura, addebito allo
scadere, niente addebito con un problema, niente doppio addebito, carta
rifiutata), `online-limit-completion.test.ts` (sopra il minimo aspetta, al
minimo no, già confermato no); 1523 prove dell'API, prove di `packages/shared`,
typecheck ed eslint di sito e API.
