/**
 * Tempi delle richieste di preventivo (docs/CHANGELOG.md §210, decisione
 * dell'utente): una richiesta generale va a tutti i professionisti
 * compatibili e nessuno ha una scadenza per rispondere. L'unico tempo che
 * conta è l'inoltro di una richiesta diretta (§209). Funzioni pure,
 * testate in `lead-routing.test.ts`.
 */

export {
  RESPONSE_DAY_START_HOUR,
  RESPONSE_DAY_END_HOUR,
  addDaytimeHours,
  DIRECT_FORWARD_URGENT_MINUTES,
  DIRECT_FORWARD_STANDARD_HOURS,
  computeDirectForwardAt,
} from "@professionisti/shared";
