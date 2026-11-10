# "Altri calendari" che funziona su iPhone (10/11/2026)

**Richiesta di Luca:** da iPhone con Safari, nella scheda di un lavoro accettato, il tasto "iPhone e altri" (Aggiungi al calendario) non faceva nulla. Poi: cambiare la scritta; tra "Telefono", "iOS/Android", "Calendario Apple" e "Altri calendari" ha scelto **"Altri calendari"**. Poi le migliorie 2 e 3 proposte: pagina chiara per il link scaduto e "Altri calendari" anche nelle email.

## Causa

Il tasto era un link `data:text/calendar,...` con `download`: il file scritto dentro la pagina. Safari su iPhone non apre i link `data:` aperti dalla pagina e non succedeva nulla. Su computer e Android invece si scaricava.

## Decisione

1. `GET /bookings/:id/calendar` non manda più il testo del file ma `icsUrl`: `<sito>/calendario/<id>.<c|p>.<scadenza>.<firma>.ics` (`apps/api/src/bookings/booking-ics-token.ts`, stessa idea dei pulsanti del promemoria: chiave legata a `JWT_SECRET` ma distinta dalle sessioni). `c`/`p` dice per chi è il file: quello del professionista ha anche il telefono del cliente, e la firma non lo lascia cambiare. Scade un mese dopo l'appuntamento (mai meno di un giorno da adesso), perché le email arrivano giorni prima.
2. `GET /bookings/ics/:file` dell'API (pubblica, in `access-policy.mjs`) controlla firma e scadenza e dà il file, riletto ogni volta: un appuntamento spostato arriva aggiornato, uno annullato dà 404. Limite di 30 richieste al minuto.
3. Il sito risponde su `/calendario/[file]` (`apps/web/src/app/calendario/[file]/route.ts`) con `Content-Type: text/calendar` e `Content-Disposition: inline`, dal nostro dominio: l'iPhone mostra da solo "Aggiungi al calendario", Android e computer aprono o scaricano il file.
4. Link scaduto o appuntamento annullato: pagina `/calendario/scaduto` (miglioria 2) con "Questo link non vale più" e il pulsante per la richiesta (cliente) o l'Agenda (professionista); se l'API non risponde, "Calendario non disponibile, riprova". Mai in Google.
5. Email con il calendario (promemoria, acconto, notifiche di prenotazione; miglioria 3): oltre a "Calendario: Aggiungi a Google Calendar" c'è la riga "Altri calendari: Aggiungi a iPhone, Outlook e altri" con il link. Il file resta anche allegato (Gmail su iPhone a volte non apre gli allegati .ics). Nessun link negli annullamenti, come per Google.
6. Il pulsante (`AddToCalendar.tsx`) punta a quel link, senza `download` (con `download` l'iPhone lo metterebbe nei Download invece di aprire il calendario), e si chiama "Altri calendari".

## Verifica

- Prova nuova con il motore di Safari: `e2e/tests/iphone-calendario.spec.ts` (progetto `iphone-safari`), tocca "Altri calendari", controlla che arrivi il file con l'ora giusta e, ad appuntamento annullato, la pagina "Questo link non vale più".
- `e2e/tests/preventivo-accettato.spec.ts` aggiornata: il link porta al sito e risponde `text/calendar`.
- Prove del link firmato (`booking-ics-token.test.ts`: giusto, scaduto, cambiato, destinatario cambiato) e delle email (righe "Calendario" e "Altri calendari").
- Test dei permessi verde. Foto della pagina scaduta in `anteprime/calendario-iphone/` della cartella del progetto.
- Da provare a mano su un iPhone vero dopo il deploy.
