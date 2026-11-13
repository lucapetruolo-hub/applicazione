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
