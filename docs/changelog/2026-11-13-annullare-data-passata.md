# Annullare: niente data già passata nel preventivo

**Richiesta** (Luca, 13/11/2026, con foto): nel preventivo con una nuova data
proposta (venerdì 13 novembre 08:00-13:00, visto venerdì alle 11:32) la riga
"Annullare" diceva "Pagando online, se annulli dopo giovedì 12 novembre alle
08:00 l'acconto non è rimborsabile": una data già passata.

**Causa**: il calcolo partiva già dalla data nuova (venerdì 08:00 meno 24 ore =
giovedì 08:00), ma la scheda del preventivo (`QuoteCard.tsx`) e il PDF del
preventivo non guardavano se il preavviso era già iniziato. Il riepilogo prima
di "Accetta" (`QuoteAcceptSummary.tsx`), l'email e la scheda del lavoro lo
facevano già.

**Decisione**: stesse parole e colori decisi da Luca l'11/11
(`2026-11-11-rosso-solo-errori.md`). Dentro il preavviso:
- scheda: "Mancano meno di 24 ore all'appuntamento." al posto di "Avvisa almeno
  24 ore prima" e, con l'acconto trattenuto, "Pagando online, l'acconto non è
  rimborsabile, anche se annulli." in ocra scuro;
- PDF: "Pagando online: mancano meno di 24 ore all'appuntamento, l'acconto di
  X € non è rimborsabile, anche se annulli."
Fuori dal preavviso resta la data esatta come prima.

**Verifica**: nuova prova in `apps/api/src/accounting/quote-pdf.service.test.ts`
(orologio dentro il preavviso: nessuna data "fino a"), typecheck di sito e API,
eslint.

## Migliorie approvate da Luca (13/11, stesso thread)

Nella stessa foto c'erano altre tre cose che Luca ha chiesto di sistemare:

- **Acconto al 100%**: "Acconto online, saldo diretto" al 100% era uguale a
  "Tutto online". Ora `quotePaymentOffer` lo trasforma in "tutto online"
  (vale anche per i preventivi già inviati), e il professionista lo legge
  sotto la percentuale quando la mette al 100%. Non si è messo un tetto al
  50%: il 100% serve a "Tutto online con carta".
- **Forbice di prezzo pagando tutto con la carta**: si paga il massimo e la
  differenza torna da sola a lavoro finito (già nel codice, `online-money.service.ts`).
  Ora la riga con le cifre lo dice: "1.150,00 € adesso con la carta, il
  prezzo massimo. Se il prezzo finale è più basso, la differenza ti torna
  sulla carta". Tolta la stessa frase da `UPFRONT_PAYMENT_NOTE` per non
  ripeterla.
- **Voci in minuscolo**: prima lettera maiuscola (`capitalizeItemName`) quando
  si salvano voci del preventivo, voci dell'importo finale e prestazioni, e
  nella scheda del preventivo anche per le voci salvate prima.

**Verifica**: prove in `packages/shared` (134 verdi), tutte le prove dell'API
(1485 verdi), typecheck di sito e API, eslint.
