# Conferme di pagamento, email dell'abbonamento e pagina Abbonamento

**Richiesta** (Luca, 03/11/2026): prendere spunto da quattro esempi (la ricevuta
di un acquisto su Vinted, l'email di conferma di un abbonamento online e la sua
pagina di fatturazione con piano, carta, fatture e disdetta). Luca ha scelto
tutte le proposte, dalla 1 alla 6.

## Cosa cambia

1. **"Pagamento confermato" al cliente** (`JOB_PAYMENT_CONFIRMED`, argomento
   "Pagamenti dei lavori"): prima, quando il cliente pagava online l'acconto o
   il saldo, da noi non riceveva nulla (solo il professionista era avvisato).
   Ora riceve il riepilogo: lavoro, professionista, appuntamento, importo,
   pagato in tutto, quanto resta, carta ("Visa •••• 4242", con Apple Pay o
   Google Pay se usati), data e ora, numero del pagamento (quello di Stripe,
   lo stesso che serve all'assistenza) e cosa succede ora. Parte anche per
   l'acconto che conferma il lavoro e per il saldo pagato in ritardo. Il
   saldo addebitato da solo sulla carta (`JOB_BALANCE_AUTO_CHARGED`) ha lo
   stesso riepilogo e ora lo manda `recordPayment`, una volta sola: prima,
   se il pagamento finiva col webhook, il cliente non riceveva l'avviso.
   - **Non è un documento fiscale**: si chiama "Pagamento confermato" e non
     "ricevuta" per non confonderlo con la ricevuta o la fattura che fa il
     professionista (CLAUDE.md §6, Documenti contabili). L'email lo dice.
   - **Non è un obbligo** (noi non incassiamo: i soldi vanno sul conto Stripe
     del professionista), ma riduce le contestazioni in banca per "addebito
     non riconosciuto", che costano 20 € al professionista.
2. **Email dell'abbonamento** (`SUBSCRIPTION_PAID`, `SUBSCRIPTION_RENEWED`):
   riquadro "Il tuo pagamento" con livello, totale e IVA, carta, data,
   prossimo addebito (o "Finisce il" se il rinnovo è annullato) e la frase
   "Puoi cambiare la carta o annullare quando vuoi dalla pagina Abbonamento".
   Pulsante alla pagina Abbonamento, link a Fatture e documenti.
3. **Carta nella pagina Abbonamento**: "Mastercard •••• 5772, Scade 12/2030"
   accanto a "Cambia la carta" (`GET /billing/card`: carta dell'abbonamento,
   altrimenti quella predefinita del cliente Stripe; solo marca, ultime 4
   cifre e scadenza).
4. **Ultime fatture nella pagina Abbonamento**: le ultime 5 fatture ABB
   (abbonamento, passaggio di livello, pacchetti) con data, totale, "Pagata"
   e "Scarica PDF", più il link a Fatture e documenti. Sono le stesse fatture
   e gli stessi PDF di Fatture e documenti (§378), nessuna strada nuova.
5. **Piede delle email**: link a Termini e Privacy sempre; ragione sociale,
   sede e P.IVA appena compilati in `COMPANY` (`packages/shared/src/brand.ts`,
   gli stessi dati del piede del sito, D.Lgs. 70/2003 art. 7).
6. **Ordine della pagina Abbonamento**: stato e livelli in cima, poi
   "Compreso in ogni livello", Pagamento (carta), Fatture e in fondo
   "Rinnovo automatico" con "Annulla abbonamento", come nelle pagine di
   fatturazione degli abbonamenti online.

## Verifica

- `apps/api/src/email/payment-confirmation-emails.test.ts`: testi del
  pagamento confermato (acconto, saldo, saldo automatico), email
  dell'abbonamento (con IVA, carta, prossimo addebito, rinnovo annullato),
  carta, piede.
- `destination-charges.test.ts`: il cliente riceve `JOB_PAYMENT_CONFIRMED`
  con carta e numero del pagamento.
- Anteprima delle email (`pnpm --filter @professionisti/api email:preview`) e
  foto della pagina Abbonamento da telefono e computer con dati di prova.

## Seguito: saldo addebitato da solo subito

Decisione di Luca (03/11/2026): l'avviso "Saldo del lavoro pagato" al cliente,
quando il saldo si addebita da solo sulla carta dell'acconto, non aspetta più
il riassunto della sera (tolto da `NOTIFICATION_DIGEST_TYPES`). È l'addebito
che il cliente non si aspetta: saperlo subito evita che lo contesti in banca.
Di notte (22-7) aspetta comunque il mattino, come tutte le email.
