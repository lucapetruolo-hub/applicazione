# Email del mattino al professionista: una sola, "Le cose di oggi"

**Richiesta** (Luca, 19/11/2026, thread "Rivedere i lavori di oggi da
esperto"): sì alla voce 11 della revisione dei lavori del 18/11. Le email al
professionista si sommavano la mattina: controllare quante sono e, se più di
due, unirle in una.

**Controllo**: tra le 8 e le 10 un professionista poteva ricevere fino a sei
email separate: "Lavori da chiudere" (dalle 8, `JOB_TO_CLOSE`), promemoria
dell'agenda, rientro dalla pausa, recensioni a cui rispondere, verifica
dell'identità e profilo da completare (tutti alle 10). Il lunedì in più
"Lavori cercati" e, nei giorni vicini al rinnovo, l'avviso dell'abbonamento
(alle 9).

**Decisione**:
- I sei promemoria del mattino (`NOTIFICATION_MORNING_TYPES` in
  `packages/shared/src/notifications.ts`) non partono più subito: aspettano le
  **10:05** italiane e partono insieme, con il meccanismo delle email
  rimandate che già usano il riassunto della sera e la notte
  (`emailHoldUntil`, `HeldEmailsService`). Anche quelli nati di notte
  aspettano le 10:05, non le 7.
- Con due o più promemoria l'email è "Le cose di oggi": titolo suo, un
  promemoria per riga con il link, pulsante "Apri Oggi". Con uno solo parte
  l'email di sempre di quel promemoria.
- Un promemoria già letto sul sito prima delle 10:05 non arriva per email
  (regola di sempre delle email rimandate).
- Restano a parte: gli avvisi dell'abbonamento (rinnovo e pagamenti, che i
  Termini promettono come avviso) e l'email del lunedì "Lavori cercati", che
  ha un contenuto suo e un interruttore suo.
- Dopo le 10:05 (raro: un promemoria nato nel pomeriggio) valgono le regole di
  sempre.

**Verifica**: prove in `email-hold.test.ts` (le 8, le 10:00:03, le 10:04:59,
la notte, dopo le 10:05, l'ora legale, gli altri tipi invariati; titolo e
pulsante di "Le cose di oggi"); tutte le prove dell'API; TypeScript.
