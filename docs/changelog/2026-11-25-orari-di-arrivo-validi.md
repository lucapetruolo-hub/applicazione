# Preventivo: solo orari validi in "Verso che ora passi?"

**Richiesta** (Luca, 25/11/2026): "quando si prepara un preventivo, nella voce
'verso che ora passi' inserisci solo gli orari compresi nell'orario che ha
selezionato in precedenza così si evita di dare l'errore successivamente".

**Situazione**: il campo era un'ora libera (`ItalianTimeInput`). Si poteva
scrivere un'ora fuori dalla fascia e l'errore "L'ora di arrivo deve essere tra
le … e le …" usciva solo premendo Invia.

**Decisione**:
- Al posto del campo, pillole con i soli orari dentro la fascia scelta, una
  all'ora dall'inizio e prima della fine (14:00-20:00 → 14:00 … 19:00),
  come le pillole di "Durata". Una all'ora perché il cliente vede comunque una
  finestra di un'ora (`2026-11-11-fasce-ampie.md`). Un tocco da telefono,
  niente rotella né tastiera (attenzione ai campi ora su iPhone).
- Regola in `arrivalTimeChoices` (`packages/shared/src/arrivalWindow.ts`).
  Un orario già salvato dentro la fascia ma fuori dal passo ("10:15" di un
  preventivo vecchio) resta tra le scelte, così modificando non si perde.
- Cambiando fascia o data, un'ora che non cade più nella fascia nuova si toglie
  da sola. Toccando di nuovo la pillola scelta, o "Non indicare l'ora", si
  toglie.
- Vale anche con "Altra data" (le pillole seguono ora di inizio e fine scritte
  a mano) e per le richieste online, dove la domanda è "Verso che ora ti
  colleghi?".
- Senza scelta la riga dice "Se non scegli, il cliente vede solo la fascia
  14:00–20:00."; con la scelta resta "Il cliente vede 'Arrivo tra le … e le …'".
- Il controllo sul server (`apps/api/src/quotes/arrival-time.ts`) e quello
  all'invio restano, come rete di sicurezza.

**Verifica**: `packages/shared/src/arrivalWindow.test.ts` (4 casi nuovi);
`e2e/tests/agenda-fasce-ampie.spec.ts` (pillole 14:00-19:00, scelta, riga del
cliente, fascia corta senza scelta, ritorno alla fascia lunga senza ora rimasta,
"Altra data" 09:00-12:30 → 09:00-12:00), verde su telefono e computer. Lint e
typecheck puliti. Foto prima/dopo in `anteprime/orari-arrivo/` nella cartella
del progetto.

## Secondo giro (25/11, ok di Luca alle migliorie 1 e 3)

**Richiesta**: "Effettua miglioria 1-3": online "Ti contatta tra le…" al posto
di "Arrivo tra le…", e le stesse pillole in Oggi.

**Decisione**:
- Online il cliente legge "Ti contatta tra le 16:00 e le 17:00" (preventivo,
  riepilogo prima di accettare, appuntamento, email e notifica dell'ora,
  cronologia "Ora del contatto indicata"); il professionista legge "contatto
  tra le…". Parola in `arrivalWord` (`packages/shared/src/arrivalWindow.ts`);
  `serviceMode` aggiunto all'appuntamento del cliente (`ClientBooking`) e al
  contenuto della notifica `BOOKING_ARRIVAL_TIME`.
- In Oggi, "Dì ai clienti di domani verso che ora passi": per ogni cliente le
  pillole con i soli orari della fascia (`arrivalTimeChoices`) al posto del
  campo ora; sotto, "Arrivo tra le … e le …" (o "Ti contatta" online).

**Verifica**: test di `packages/shared` (272) e dell'API (1789) verdi;
`e2e/tests/agenda-fasce-ampie.spec.ts` con le pillole in Oggi (08:00-18:00
nella fascia 08:00-19:00), verde su telefono e computer; typecheck di sito,
API e app e lint puliti. Foto `oggi-*.png` e `online-cliente-*.png`.
