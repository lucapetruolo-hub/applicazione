# Annullare: spostare un appuntamento con l'acconto

**Richiesta** (Luca, 13/11/2026, thread "Correggere l'avviso di annullamento
con data passata", PR 3 di 4 approvata con "ok"): avviso prima di accettare una
nuova data dentro il preavviso, e la nuova scadenza nell'email.

**Problema** (tabella dei casi, sezione D): spostando un appuntamento già
fissato con l'acconto trattenuto, se la nuova data era dentro il preavviso il
cliente perdeva subito il diritto al rimborso senza che nessuno glielo
dicesse; l'email "appuntamento spostato" non diceva la nuova scadenza.

**Decisione**:
- `rescheduleCancellationLine()` in `packages/shared/src/cancellationNotice.ts`,
  stessa fonte delle altre frasi:
  - cliente, data dentro il preavviso con l'acconto trattenuto: "Con questa
    data mancano meno di 24 ore: l'acconto di X non sarà più rimborsabile,
    anche se annulli." in ocra scuro;
  - cliente, data fuori dal preavviso con l'acconto trattenuto: "Con questa
    data puoi annullare gratis fino a …";
  - professionista: "Con questa data il preavviso è già iniziato: se il
    cliente annulla, l'acconto di X resta a te." oppure la nuova scadenza.
- Dove si legge: sopra "Accetta nuova data" del cliente
  (`BookedDateChangeAnswer.tsx`), mentre il cliente sceglie un'altra data per
  un appuntamento fissato (`QuoteDateChooser.tsx`) e sopra "Accetta nuova
  data" del professionista (`RequestCard.tsx`). Si aggiorna ogni minuto.
- Email "Appuntamento spostato" (a chi non ha accettato, cliente o
  professionista): una riga con la regola per annullare con la data nuova
  (`cancelNotice`, da `cancellationTerms`).

**Verifica**: prove in `packages/shared/src/cancellationTerms.test.ts` (tutti i
casi della riga) e `apps/api/src/quotes/booked-date-change.test.ts` (scadenza
nell'email al cliente e al professionista); typecheck, eslint, 1494 prove
dell'API.
