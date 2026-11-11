# Fasce ampie: lavori uno sotto l'altro e ora indicativa di arrivo

**Richiesta** (Luca, 10-11/11/2026): "quando una persona prenota, prenota per
tutta la fascia, giusto? Quindi ci sono sulla stessa fascia ampia più
prenotazioni con gli stessi orari". Proposte approvate ("sì" a tutte e due):
lavori con la stessa fascia uno sotto l'altro come un elenco; ora indicativa
di arrivo facoltativa nel preventivo, con il lavoro messo a quell'ora in agenda.

**Situazione**: un preventivo con l'orario preso dall'agenda (le pillole
"Quando") prende tutta la fascia, per esempio 08:00-19:00, e così
l'appuntamento. Con più lavori nella stessa fascia l'agenda mostrava colonne
uguali e strette (docs/changelog/2026-11-10-appuntamenti-sovrapposti.md).

**Decisione**:
- Agenda, Giorno e Settimana: lavori con la stessa identica fascia uno sotto
  l'altro nella loro corsia, ciascuno con una riga della fascia (nome e, se c'è
  posto, città e lavoro), purché ogni riga resti alta almeno 34 px; altrimenti
  restano affiancati (`stackSameBand` in
  `apps/web/src/components/agenda/AgendaTimeGrid.tsx`). Nella Settimana del
  telefono la riga mostra l'inizio del nome; il lettore di schermo dice "2 di 3
  nella stessa fascia".
- Ora indicativa di arrivo: nuovo campo `arrivalTime` ("HH:MM", ora italiana)
  su `Quote` e `Booking` (migrazione additiva `20261111090000_ora_di_arrivo`).
  Nel preventivo compare "Verso che ora passi? (facoltativo)" solo se la fascia
  scelta dura almeno 3 ore. Il server controlla che cada dentro la fascia
  (`apps/api/src/quotes/arrival-time.ts`), la copia nell'appuntamento quando
  il cliente accetta e la azzera quando cambia la data (proposte del cliente o
  del professionista, spostamento dell'appuntamento).
- Il cliente legge "Arrivo verso le 10:00" nel preventivo, nel riepilogo prima
  di accettare e nell'appuntamento; il professionista nella richiesta.
- In agenda il lavoro con l'ora di arrivo sta a quell'ora, lungo un'ora, con
  scritto "verso le 10:00 · fascia 08:00-19:00". I posti della fascia e il
  bordo rosso si contano sempre sull'orario vero della fascia.

**Verifica**: `apps/api/src/quotes/arrival-time.test.ts`; prova nel browser
`e2e/tests/agenda-fasce-ampie.spec.ts` (tre lavori 08:00-19:00 uno sotto
l'altro in Giorno e Settimana, telefono e computer; preventivo con arrivo alle
10 messo alle 10 e "Arrivo verso le 10:00" per il cliente; campo che compare
con la fascia 14-20 e sparisce con una fascia di due ore). Typecheck e lint
puliti.

## Secondo giro (11/11, ok di Luca alle due migliorie proposte)

**Richiesta**: "si" a "nella vista Settimana sul telefono, il nome completo
quando tocchi la riga" e a "un preventivo in attesa che occupa tutta la fascia
mostrato come una striscia sottile".

**Decisione**:
- Settimana sul telefono: il primo tocco su un lavoro apre in basso un foglio
  con nome intero, orario, città e tipo, "Apri" (che fa quello che faceva il
  tocco prima) e "Chiudi"; Esc lo chiude, cambiando settimana sparisce.
  Giorno e computer restano col tocco che apre subito.
- Un preventivo in attesa lungo almeno 3 ore, senza ora di arrivo, che tocca un
  lavoro già preso diventa una striscia a righe ottone a destra della colonna
  (12 px al computer, 8 px sul telefono, `waitStrips`); il lavoro preso resta
  largo. Al computer il nome si legge passando sopra, sul telefono col foglio,
  col lettore di schermo sempre. Da solo nella fascia resta un riquadro.

**Verifica**: `e2e/tests/agenda-fasce-ampie.spec.ts` (foglio col nome intero e
"Apri" a fuoco sul telefono; striscia larga meno di 14 px con il lavoro accanto
largo più del 60% della colonna, telefono e computer). Prove di
`agenda-sovrapposti` ancora verdi.
