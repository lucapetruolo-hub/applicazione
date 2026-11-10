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
