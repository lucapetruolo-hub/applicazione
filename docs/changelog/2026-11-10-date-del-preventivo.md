# Date del preventivo: l'orario già scelto sempre in vista

**Richiesta** (Luca, 10/11/2026, thread "Semplificare l'elenco delle date nel
preventivo", con foto da computer): l'elenco "Quando" del preventivo
(`/dashboard/richieste`) è lunghissimo; e quando cliente o professionista hanno
già proposto una data e un orario, l'elenco deve aprirsi già su quello: oggi
non si vede tra i primi orari che compaiono.

**Decisione** (primo giro, il difetto): nel modulo del preventivo i primi sei
orari in vista (`quoteSlotsInView` in
`apps/web/src/app/dashboard/richieste/_components/RequestCard.tsx`) tengono
sempre l'orario già scelto, per primo, anche quando cade dopo i primi sei:
l'orario chiesto dal cliente aprendo un preventivo nuovo, o quello già nel
preventivo quando lo si modifica. Stesso comportamento che la richiesta del
cliente ha già (`SlotPills` in `GuidedRequestForm.tsx`, "L'orario scelto resta
in vista"). Prima la pillola verde poteva essere la ventesima: si vedeva solo
premendo "Altri orari", che apriva tutte le fasce di cinque settimane.

**Secondo giro, il nuovo aspetto** (Luca ha scelto la soluzione A tra le tre
proposte con le anteprime in `anteprime/date-preventivo/` della cartella del
progetto: A un giorno per riga, B striscia di giorni, C tabella della
settimana): `WeekSlotPicker` (`apps/web/src/components/WeekSlotPicker.tsx`)
mostra gli orari liberi una settimana alla volta, con le frecce "Settimana
prima/dopo", un giorno per riga ("Oggi", "Domani" o "mer 11 nov") e le fasce
affiancate. Si apre sulla settimana dell'orario già scelto e, se l'orario
cambia da fuori (modulo riaperto), la segue. Al posto delle sei pillole
"giorno · fascia" con "Altri orari", che apriva tutte le fasce di cinque
settimane di fila (fino a sessanta pillole). Così sparisce anche il primo giro
(`quoteSlotsInView`): la settimana dell'orario scelto lo mostra già.

**Migliorie approvate da Luca** (stesso giorno):
- Pallino "chiesto dal cliente" sulla fascia chiesta, con la legenda sotto la
  settimana, anche quando se ne sceglie un'altra (`marked` di
  `WeekSlotPicker`; il lettore di schermo sente ", chiesto dal cliente").
  Colore `ottoneScuro`, lo stesso della riga "Il cliente aveva chiesto…".
- Stesso aspetto nella "Proponi un'altra data" del professionista, che era un
  menu a tendina con tutte le fasce: la fascia proposta dal cliente è segnata
  "proposto dal cliente". `slotLabel` di `requestHelpers.tsx` non serve più.

Proposta non scelta (riproponibile): togliere le fasce di oggi già iniziate o
troppo vicine.

**Verifica**: `tsc` ed eslint del sito puliti; prova nel browser
`e2e/tests/date-preventivo.spec.ts` (telefono e computer: si apre sulla
settimana dell'orario chiesto tra circa tre settimane, già scelto e segnato,
frecce, nessun problema grave di accessibilità con axe).

## Terzo giro (dopo l'unione di #308)

**Richiesta** (Luca, stesso giorno): sì alla prova automatica per "Proponi
un'altra data" e allo stesso elenco a settimane nella richiesta del cliente.

**Decisione**:
- Prova nuova in `e2e/tests/date-preventivo.spec.ts`: con una data proposta
  dal cliente tra circa tre settimane, "Modifica" apre la sua settimana con la
  fascia scelta e segnata "proposto dal cliente", niente menu a tendina, e
  "Invia nuova proposta" salva la fascia scelta.
- Richiesta del cliente (`GuidedRequestForm`): `WeekSlotPicker` al posto di
  `SlotPills` (primi tre orari + "Altri orari" che apriva i giorni sette alla
  volta), con "Nessuna preferenza" sopra. Si apre sulla settimana dell'orario
  arrivato dal link (`data`/`fasciaOraria`). `WeekSlotPicker` ora ordina le
  fasce: la richiesta mette in testa l'orario del link anche se è più avanti.
  Tolte le classi non più usate `.slot-days`, `.slot-day`, `.slot-day-label`.

**Verifica**: `tsc` e `pnpm lint` del sito, `tsc` di e2e; le cinque prove di
`date-preventivo.spec.ts` passano in locale (telefono e computer, axe).

**Andamento sul telefono** (sì di Luca, stesso giorno): con il passo in più
"Modifica richiesta dal cliente" le etichette "Fissato" e "Terminato" si
sovrapponevano. Le colonne di `MiniTimeline` (professionista e cliente) ora
sono tutte larghe uguali (`flexBasis={0}`, 2 px di margine), così l'etichetta
lunga va a capo nella sua colonna. Controllato nella prova "Modifica…" di
`date-preventivo.spec.ts` (le due etichette non si toccano).
