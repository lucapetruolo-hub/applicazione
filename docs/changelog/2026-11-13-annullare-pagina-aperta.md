# Annullare: pagina aperta, controllo ad "Accetta" e testo salvato sul lavoro

**Richiesta** (Luca, 13/11/2026, thread "Correggere l'avviso di annullamento
con data passata", PR 2 di 4 approvata con "ok"): "Fai aggiornare la frase
quando la pagina resta aperta e passa l'ora. Al momento di Accetta controlla
l'ora sul server. Verifica che il testo esatto visto dal cliente resti salvato
sul lavoro."

**Problemi** (tabella dei casi, sezione E):
1. Scheda del preventivo, riepilogo, pagina "Appuntamento prenotato", confronto
   e scheda del professionista calcolavano la frase solo all'apertura: alle
   08:05 c'era ancora scritto "gratuito fino alle 08:00".
2. Il server non sapeva cosa aveva letto il cliente: premendo "Accetta" alle
   08:01 il lavoro nasceva già dentro il preavviso, con l'acconto non più
   rimborsabile, senza che il cliente l'avesse mai letto.
3. Il testo letto non restava sul lavoro: c'era solo l'email "Appuntamento
   prenotato", che non è salvata nel database.

**Decisione**:
- `useMinuteClock()` (`apps/web/src/lib/useMinuteClock.ts`): l'ora si
  aggiorna allo scoccare di ogni minuto e tornando sulla scheda; tutte le
  frasi ricevono quest'ora (senza, il React Compiler può tenere il risultato
  di prima).
- "Accetta" manda il momento letto (`seenCancellationPhase`: gratuito, dentro
  il preavviso, già iniziato) e da quando era sullo schermo. Se nel frattempo è
  peggiorato, il server risponde 409 "Il tempo per annullare gratis è appena
  scaduto: rileggi e conferma." (o "L'appuntamento è appena iniziato: rileggi e
  conferma.") e il lavoro non nasce. Facoltativo, per l'app vecchia.
- Nuova colonna `Booking.acceptedTerms` (migrazione solo additiva
  `20261113180000_testo_accettato`): frasi lette, modo di pagamento con le
  cifre, preavviso, scadenza, ora di lettura e ora di accettazione (tipo
  `AcceptedTerms`, `packages/shared/src/acceptedTerms.ts`).
- Acconto online e pagamento finito su Stripe dopo la scadenza che il cliente
  aveva letto: non ha mai potuto annullare gratis, quindi l'acconto gli torna
  anche annullando tardi (`depositRefundedIfLate`). Lo dicono allo stesso modo
  scheda del lavoro, email e scheda del professionista
  (`depositKeptOnLateCancel`). La pagina di pagamento già aperta si rifà se il
  cliente ha riletto frasi diverse.

**Verifica**:
- `packages/shared/src/acceptedTerms.test.ts` (testo salvato, pagamento oltre
  la scadenza, controllo del momento, prove a caso con fast-check).
- API: `bookings.service.test.ts` (409 con nessun lavoro, testo salvato,
  momento nella pagina di pagamento, webhook oltre la scadenza, annullamento
  con l'acconto che torna); tutte le 1492 prove verdi.
- Playwright `preventivo-accettato.spec.ts`: `page.clock` fa passare 3 minuti
  con la pagina aperta e la frase cambia da sola; 409 dal server e testo
  salvato nel database.
