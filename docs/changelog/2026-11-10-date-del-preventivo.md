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

Il nuovo aspetto dell'elenco lungo (giorno per riga e una settimana alla
volta, striscia di giorni o tabella della settimana) è proposto a Luca con le
anteprime in `anteprime/date-preventivo/` della cartella del progetto e si fa
dopo la sua scelta.

**Verifica**: `tsc` del sito pulito; anteprime telefono e computer prima/dopo.
