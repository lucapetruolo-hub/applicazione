# "Le mie richieste" più leggera su telefono lento

**Richiesta**: le misure Lighthouse su telefono lento fermavano le PR delle
funzioni nuove (#272 confronto dei preventivi, #274 lavori fatti tramite il
sito) su "Le mie richieste": tempo di blocco (TBT) 521-535 ms, oltre il
limite di 500. Senza nessuna PR la pagina era già a 463-489 ms, quindi
qualunque aggiunta la faceva superare. Il limite non si alza (sicurezza e
stabilità prima della velocità): si alleggerisce la pagina.

**Cosa pesava**: all'apertura la pagina scaricava ed eseguiva due cose che
servono solo dopo un tocco:
- l'elenco dei comuni d'Italia (circa 280 KB), importato direttamente da
  `@professionisti/shared` nel modulo "Modifica" della richiesta e nei campi
  della fattura, mentre il sito ha già `useComuni` (`apps/web/src/lib/comuniLazy.ts`,
  collaudo N-01) proprio per non caricarlo con la pagina;
- tutto zod (circa 110 KB), portato dal controllo dei dati della fattura
  (`clientInvoiceRequestSchema`) e dalla costante `EMAIL_CODE_LENGTH`, che
  stava nel file degli schemi.

**Decisione**:
- Il modulo "Modifica" della richiesta usa `useComuni(isEditing)`: i comuni
  arrivano quando si apre il modulo. I campi della fattura usano `useComuni()`
  (al primo tocco su un campo). Come in `GuidedRequestForm`, la città si
  controlla quando l'elenco c'è; il server la ricontrolla comunque.
- `parseInvoiceDraft` è in `apps/web/src/components/clientInvoiceDraftParse.ts`
  e si carica con un `import()` solo all'invio (accettazione del preventivo o
  "Salva" dei dati per la fattura).
- `EMAIL_CODE_LENGTH` è in `packages/shared/src/emailCode.ts`, senza zod.
- "Lavoro terminato" e la recensione (`ClientCompleteModal`, `ReviewModal`)
  si caricano con `next/dynamic` quando si aprono.

**Verifica**:
- JavaScript della pagina da circa 1,3 MB a 0,9 MB; nessun pezzo con zod o
  con i comuni nell'elenco dei file della pagina dopo `next build`.
- Lighthouse in locale, profilo telefono lento, 5 misure: TBT mediano da
  479 ms a 241 ms, punteggio di velocità da 88 a 90 o più.
- Nuova prova `e2e/tests/le-mie-richieste-leggera.spec.ts`: città scelta
  dall'elenco nel modulo "Modifica" (e città inventata fermata), provincia
  presa dal comune nella fattura, "Controlla i dati per la fattura." senza
  codice fiscale e nessun lavoro creato. Ripassate `elimina-richiesta` e
  `preventivo-accettato`.
