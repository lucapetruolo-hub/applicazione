# Appuntamenti sovrapposti affiancati in agenda

**Richiesta** (Luca, 10/11/2026): "in agenda nell'orario 14-20 di venerdì 13
vedo solo un appuntamento, quando in realtà ce ne sono due presi".

**Causa**: nella griglia di Giorno e Settimana ogni impegno occupava tutta la
larghezza della colonna (`left: 5px; right: 5px`). Due impegni nella stessa
fascia (qui un appuntamento confermato e un preventivo in attesa di due
giorni, "Giorno 1 di 2") venivano disegnati uno sopra l'altro: si vedeva solo
l'ultimo. I conteggi in alto contavano poi un preventivo su due giorni come
due preventivi ("2 in attesa").

**Decisione**:
- Impegni che si toccano affiancati come in Google Calendar
  (`layoutLanes` in `apps/web/src/components/agenda/AgendaTimeGrid.tsx`): ogni
  gruppo divide la colonna in tante corsie quante ne servono; a parità d'orario
  il lavoro confermato sta a sinistra, il preventivo in attesa a destra. Conta
  anche l'altezza minima del riquadro (26 px), così due impegni brevi vicini
  non si coprono.
- Settimana sul telefono: due corsie sono troppo strette per l'ora, restano le
  strisce colorate (il lettore di schermo legge nome e orario di ognuna).
- Il lettore di schermo aggiunge "nella stessa fascia di un altro impegno".
- Un lavoro o un preventivo su più giorni conta una volta sola nel riepilogo
  ("1 lavoro · 1 in attesa") e in "Mostra".
- Mese e Anno non cambiano: mostravano già un pallino o una riga per impegno.

**Verifica**: prova nel browser `e2e/tests/agenda-sovrapposti.spec.ts`
(appuntamento 09:00–10:30 e preventivo 09:30–11:00 lo stesso lunedì, Giorno
e Settimana, telefono e computer): i due riquadri ci sono e non hanno pixel
in comune. Typecheck e lint di `apps/web` puliti.

## Secondo giro: avviso e bordo rosso con le fasce larghe

**Richiesta** (Luca): sì all'avviso nel preventivo e al bordo rosso in agenda,
"considerando che si possono impostare anche delle fasce di lavoro ampie,
quindi ad esempio 08:00-19:00 e lì tutte le prenotazioni all'interno".

**Situazione**: l'avviso nel preventivo esisteva già (collaudo C-15), ma
scattava per ogni lavoro nella stessa fascia, anche con posti liberi: con le
fasce di partenza (8-13 e 14-20, 5 posti) era quasi sempre acceso.

**Decisione**: stessa regola del server quando il cliente accetta
(`apps/api/src/agenda/commitments.ts`), valida per fasce di qualsiasi durata.
- Preventivo e "Proponi un'altra data": orario in una fascia con posto (le
  fasce piene non compaiono tra quelle libere) = riga grigia "In questa fascia
  hai già 1 lavoro: … C'è ancora posto."; fascia piena o orario fuori dalle
  fasce che tocca un lavoro = avviso color ottone "Ti sovrapponi a … Scegli
  un altro orario o mandalo lo stesso." (`hasRoomAt` e `BusyTimeNotice` in
  `apps/web/src/app/dashboard/richieste/_components/requestHelpers.tsx`).
- Agenda: bordo rosso sottile solo sui lavori (prenotazioni e lavori esterni,
  non i preventivi in attesa) che insieme superano i posti della fascia in cui
  comincia il lavoro; fuori dalle fasce il posto è uno. Un lavoro esterno
  conta per ogni modalità, una prenotazione solo per la sua; i lavori su più
  giorni non occupano posti. Il lettore di schermo dice "sovrapposto".

**Verifica**: nuova prova in `e2e/tests/agenda-sovrapposti.spec.ts`
(appuntamento e lavoro esterno insieme: rossi senza fasce, non rossi con una
fascia da due posti). Typecheck e lint puliti.

## Terzo giro: nome in alto nei riquadri lunghi

Preparando la foto di una fascia 08:00-19:00 con più lavori (chiesta da Luca):
il riquadro è un pulsante, che metteva nome e orario a metà altezza (nella
foto di Luca "Gianpaolo" stava alle 17 in un blocco 14-20). Ora stanno in
alto (`.ag-ev` in `apps/web/src/components/agenda/agenda.css`).
