# "Altri calendari" che funziona su iPhone (10/11/2026)

**Richiesta di Luca:** da iPhone con Safari, nella scheda di un lavoro accettato, il tasto "iPhone e altri" (Aggiungi al calendario) non faceva nulla. Poi: cambiare la scritta; tra "Telefono", "iOS/Android", "Calendario Apple" e "Altri calendari" ha scelto **"Altri calendari"**.

## Causa

Il tasto era un link `data:text/calendar,...` con `download`: il file scritto dentro la pagina. Safari su iPhone non apre i link `data:` aperti dalla pagina e non succedeva nulla. Su computer e Android invece si scaricava.

## Decisione

1. `GET /bookings/:id/calendar` non manda più il testo del file ma `icsPath`, un link firmato: `/bookings/ics/<id>.<scadenza>.<firma>.ics` (`apps/api/src/bookings/booking-ics-token.ts`, stessa idea dei pulsanti del promemoria: chiave legata a `JWT_SECRET` ma distinta dalle sessioni, vale 24 ore).
2. `GET /bookings/ics/:file` risponde senza accesso con `Content-Type: text/calendar` e `Content-Disposition: inline`: l'iPhone mostra da solo "Aggiungi al calendario", Android e computer aprono o scaricano il file. Il file si rilegge ogni volta (un appuntamento spostato arriva aggiornato, uno annullato dà 404). Limite di 30 richieste al minuto.
3. Il pulsante (`AddToCalendar.tsx`) punta a quell'indirizzo, senza `download` (con `download` l'iPhone lo metterebbe nei Download invece di aprire il calendario), e si chiama "Altri calendari".

## Verifica

- Prova nuova con il motore di Safari: `e2e/tests/iphone-calendario.spec.ts` (progetto `iphone-safari`), tocca "Altri calendari" e controlla che arrivi il file dell'appuntamento con l'ora giusta.
- `e2e/tests/preventivo-accettato.spec.ts` aggiornata: il link porta all'API e risponde `text/calendar`.
- Prove del link firmato (`booking-ics-token.test.ts`): giusto, scaduto, cambiato.
- Da provare a mano su un iPhone vero dopo il deploy.
