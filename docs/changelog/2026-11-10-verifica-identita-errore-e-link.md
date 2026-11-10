# Verifica identità: l'errore non compare mentre Didit valuta, link ai dati fiscali solo quando servono

**Richiesta** (Luca, 10/11/2026, thread "Evitare l'errore di verifica mentre
Didit valuta", foto da iPhone del passo 2 con "Non siamo riusciti a leggere i
dati del documento"): la schermata "Riprova la verifica" può uscire anche
mentre la valutazione è ancora in corso?

## Controllo

- No. La schermata d'errore compare solo con il tentativo in `DECLINED` o
  `EXPIRED`. Didit "Not Started", "In Progress", "Awaiting User" e
  "Resubmitted" diventano `STARTED` ("Finisci la verifica", o l'attesa con
  aggiornamento automatico se si torna da Didit); uno stato sconosciuto
  diventa `PROCESSING` (attesa). `DECLINED` arriva solo da Didit "Declined",
  da "In Review" (nessun caso all'admin, §255) o dal confronto con i dati
  fiscali. Per Didit "Declined" e "In Review" sono esiti dati a valutazione
  finita, mai passaggi intermedi (docs.didit.me, stati della sessione).
  L'esito si rilegge sempre dall'API di Didit, quindi un webhook in ritardo
  o arrivato fuori ordine non cambia nulla.
- Il messaggio della foto viene dagli avvisi di Didit sul documento
  (`VALIDATION_FAILED`, `NOT_DETECTED`, `DATA_INCONSISTENT`…): il codice
  esatto è nel registro azioni della verifica in Admin.

## Decisione

- "Controlla i dati fiscali →" solo sotto un motivo che riguarda i dati
  fiscali (`identityReasonNeedsFiscalFix` in `packages/shared`): sotto un
  errore di foto o di selfie portava fuori strada.
- La casella del consenso al volto resta vuota a ogni nuovo tentativo: il
  consenso biometrico (art. 9 GDPR) va dato con un gesto attivo, una casella
  già spuntata non vale (Corte UE, Planet49 C-673/17).

## Verifica

- Prova in `packages/shared/src/identityVerification.test.ts`; `typecheck` e
  lint del sito.
