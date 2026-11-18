# Spostare la data dal professionista e lavoro terminato in anticipo

**Richiesta** (Luca, 18/11/2026): "dare la possibilità anche al professionista
di modificare la data di un preventivo già accettato come ora avviene per il
cliente" e "poter cliccare lavoro terminato anche se non è arrivato il giorno e
orario del lavoro", con la valutazione da esperto. Proposta approvata da Luca
("ok per tutte e due le cose in una PR"), più la statistica degli spostamenti
chiesti all'ultimo momento ("si").

**Com'era**: il professionista poteva cambiare la data di un lavoro fissato
solo rispondendo con "Modifica" a una proposta del cliente; se era lui a non
poter venire doveva annullare (acconto restituito) o scrivere in chat. "Lavoro
terminato" era bloccato per tutti e due fino al giorno dell'appuntamento
(§311, §346, collaudo F-01), perché col pagamento online il saldo si sarebbe
addebitato prima del lavoro.

**Decisione**:
- **"Proponi un'altra data" anche per il professionista** sul lavoro fissato
  (pulsante nella scheda di Richieste e nel menu ≡), con lo stesso modulo e lo
  stesso percorso di "Modifica" (`counterProposeBookedDate`, regola
  nessuna strada nuova): il cliente accetta, rifiuta o
  propone un'altra data, come già per "Modifica". Finché non risponde resta la
  data di adesso. Niente proposta per le visite di un lavoro ricorrente (si
  saltano dalla serie; dal secondo giro si spostano anche una alla volta,
  vedi sotto) né con un'altra proposta già in sospeso.
- **Il cliente non perde l'acconto per uno spostamento chiesto dal
  professionista**: finché la proposta aspetta la sua risposta, annullare non è
  "tardivo" (`proposedByProfessionalFirst`, `BookingDateChange.clientCancelsFree`).
  Lo dicono l'email, il riquadro della proposta, la riga sotto "Serve cambiare?"
  e la finestra di annullamento. Si riconosce lo spostamento chiesto per primo
  dal professionista perché il cliente che propone segna sempre "non posso"
  (`clientCantComeAt`). Se il cliente rifiuta, resta la data di prima e valgono
  le regole di sempre.
- **Sotto le 24 ore** la proposta si può fare lo stesso: resta segnata come
  "all'ultimo momento" (vedi sotto).
- **"Lavoro terminato" prima del giorno fissato**: il lavoro non si chiude
  subito. Il professionista preme "Lavoro terminato" (menu ≡), legge "Il lavoro
  è fissato per ..." e preme "Chiedi conferma al cliente"
  (`PATCH /bookings/:id/ask-early-completion`, una volta sola,
  `Booking.earlyCompletionAskedAt`). Al cliente arriva l'avviso nuovo
  `JOB_EARLY_DONE_ASKED` (argomento "Lavoro terminato", niente WhatsApp) e in Le
  mie richieste il riquadro "Il lavoro è già finito?" con "Lavoro terminato".
  Appena conferma, il professionista chiude come sempre con l'importo; la data
  del lavoro diventa quella vera (finisce adesso, stessa durata,
  `earlyCompletionDates`), così agenda, fatture, estratto e conteggi tornano.
  Saldo online, recensione e statistiche partono solo dopo la conferma del
  cliente. Se il cliente non risponde, il giorno fissato valgono le regole di
  sempre. L'API accetta la conferma del cliente anche prima del giorno (da
  sola non muove soldi); il pulsante compare solo quando il professionista l'ha
  chiesta. L'Agenda resta com'era: la chiusura in anticipo passa da Richieste.
- **Statistica**: ogni proposta di spostamento su un lavoro fissato resta in
  `booking_reschedules` (chi l'ha chiesta e se era dentro il preavviso per
  annullare). In Statistiche, "Come stai lavorando", il riquadro nuovo
  "Spostati all'ultimo momento": quelli chiesti dal professionista nel periodo,
  con quelli dei clienti sotto.

## Secondo giro: quattro aggiunte (stesso giorno)

**Richiesta** (Luca, 18/11/2026, sera): "cos'altro c'è da valutare che non ho
valutato da massimo esperto del settore?". Proposte quattro aggiunte, Luca ha
risposto "si" a tutte.

- **Proposta senza risposta vicino all'appuntamento**: prima partiva un solo
  promemoria dopo 12 ore, che poteva arrivare dopo l'orario. Ora, se la
  proposta aspetta ancora risposta 3 ore prima dell'appuntamento, arriva a
  tutti e due l'avviso nuovo `BOOKING_DATE_CHANGE_UNANSWERED` (argomento
  "Preventivi e date", niente WhatsApp): vale l'orario di adesso; al
  professionista che aveva proposto si dice di annullare se non riesce a
  venire. Mai di notte: alle 20 si avvisa già per gli appuntamenti del
  mattino dopo fino alle 11 (`lastCallHorizon`). Passato l'orario la proposta
  scade da sola, con una riga nella cronologia
  (`DateChangeRemindersService.lastCallAndExpire`, `Booking.rescheduleLastCallAt`).
- **"Il lavoro è già finito?" senza risposta**: un promemoria al cliente dopo
  24 ore, uno solo, solo prima del giorno fissato
  (`CompletionDeadlineService`, `Booking.earlyCompletionReminderAt`).
- **Proposte che rimbalzano**: `Booking.rescheduleRounds` conta le proposte di
  fila senza accordo (si azzera ad accordo, rifiuto o scadenza). Dal terzo
  giro, cliente e professionista leggono "Non riuscite a trovare una data?
  Scrivetevi in chat" con "Scrivi in chat" (`DateRoundsHint`).
- **Spostare una sola visita di un lavoro ricorrente**: "Sposta" accanto a
  "Salta questa volta" nel riquadro del lavoro ricorrente, per cliente e
  professionista. Apre la solita "Proponi un'altra data" per quella visita
  (`bookingId` nella proposta), e l'altro risponde con gli stessi pulsanti.
  Una proposta alla volta per serie, perché la data proposta sta sul
  preventivo; le altre visite e il preventivo restano com'erano. Cade il
  blocco "Per un lavoro ricorrente usa Salta questa volta".

**Migrazione**: solo colonne (`bookings.earlyCompletionAskedAt`,
`earlyCompletionReminderAt`, `rescheduleLastCallAt`, `rescheduleRounds`) e una
tabella (`booking_reschedules`) nuove.

**Verifica**: prove dell'API (`booked-date-change.test.ts`,
`online-limit-completion.test.ts`); prova nel browser
`e2e/tests/sposta-e-terminato-in-anticipo.spec.ts` da telefono e computer, con
le foto in `anteprime/sposta-e-terminato-in-anticipo/`.
