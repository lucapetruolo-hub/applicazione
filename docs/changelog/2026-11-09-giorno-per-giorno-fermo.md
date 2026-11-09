# "Giorno per giorno" non sposta più la pagina

**Richiesta** (Luca, 09/11/2026): in Agenda → Orari, nel riquadro "Giorno per
giorno", toccando un pulsante qualsiasi (giorni, frecce, Giorno/Settimana/Mese,
fasce, +, Chiudi, Elimina più fasce) la pagina si sposta da sola.

**Cause trovate** (agenda provata in locale, posizione misurata prima e dopo
ogni tocco):
1. La striscia dei giorni stava sopra i pulsanti Giorno/Settimana/Mese e
   c'era solo nella vista Giorno: passando da Giorno a Settimana o Mese i
   pulsanti salivano di 57 px (computer) o 84 px (telefono), e tornando a
   Giorno scendevano.
2. Il riquadro è l'ultimo della pagina: quando si accorcia (da Mese a Giorno,
   "Annulla" di Elimina più fasce, un giorno con meno fasce) il browser, già
   in fondo, trascina su tutta la pagina (fino a 73 px).
3. Safari non tiene ferma la vista quando cresce qualcosa più in alto:
   "Chiudi" aggiunge il giorno chiuso nel riquadro "Chiudi un giorno o le
   ferie" e tutto scendeva di 46 px (simulato in Chromium con
   `overflow-anchor: none`).

**Decisione**:
- La striscia dei giorni va sotto Giorno/Settimana/Mese, come già nel
  Calendario (`belowToolbar` di `CalendarShell`): comparendo non sposta i
  pulsanti.
- `useKeepInPlace` (`apps/web/src/lib/useKeepInPlace.ts`): un tocco nel
  riquadro ne segna la posizione e, per 4 secondi (copre le risposte lente
  dell'API), prima di ogni disegno la pagina torna dov'era. Uno spazio vuoto
  sotto il riquadro evita il trascinamento in fondo e si ritira scorrendo su.
  Se la persona scorre lei (rotellina, dito, tasti), il riquadro non viene
  più tenuto.

**Verifica**: 11 tocchi (Giorno, frecce, due giorni della striscia,
Settimana, Mese, Giorno, Chiudi, Riapri, Elimina più fasce, Annulla) a metà e
in fondo alla pagina, su computer (1400×800) e telefono (iPhone 13), con e
senza il comportamento di Safari: 0 px di spostamento ovunque (prima fino a
84 px). Anche "+" con chiusura della finestra: nessuno spostamento.
