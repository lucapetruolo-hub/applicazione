# "Chiudi" e "Riapri" un giorno diventano pulsanti

**Richiesta** (Luca, 09/11/2026, provando "Giorno per giorno" sull'iPhone):
"i pulsanti Chiudi e Riapri non si capiscono bene. Renderli pulsanti?"

**Decisione**:
- Al posto della parola sottolineata, un pulsante con il bordo e l'icona del
  calendario: "Chiudi il giorno" nella vista Giorno, "Chiudi" nella
  Settimana. Già nella verifica del 24/10 (T1, docs/CHANGELOG.md §311) un
  "Chiudi" da solo veniva preso per "chiudi il riquadro".
- Giorno chiuso: riquadro grigio "Giorno chiuso" con "Nessuno può prenotare
  in questo giorno." e sotto il pulsante verde "Riapri il giorno"
  (Settimana: "Chiuso" e "Riapri").
- Settimana stretta (sotto i 1000 px, cioè sul telefono): solo le icone; il
  nome completo ("Chiudi venerdì 13") resta per il lettore di schermo e
  compare passando sopra col mouse.
- Mentre si salva il pulsante è spento e nella vista Giorno dice "Salvo...".

- Pulsante più piccolo (richiesta di Luca): alto 28 px, testo 12 px, icona
  13 px (sul telefono resta sopra i 24 px chiesti da WCAG 2.5.8).
- Nella vista Giorno il nome per il lettore di schermo contiene la scritta
  visibile ("Chiudi il giorno venerdì 13", WCAG 2.5.3): il controllo di
  accessibilità della CI lo chiedeva.

**Migliorie approvate da Luca**:
- Settimana sul telefono: nelle fasce solo l'ora d'inizio ("8", "14" con
  "30" piccolo in alto per le mezz'ore), come nel Calendario; prima si
  leggeva "0…" o "1…". Sul computer resta "08:00–12:00".
- Chiudere un giorno con appuntamenti chiede conferma ("Chiudere lunedì 26
  ottobre?") e dice che gli appuntamenti restano validi e non vengono
  annullati (richiesta di Luca). Contano i lavori presi sul sito ancora da
  fare e i lavori esterni in programma. Riusa la finestra di conferma di
  "Annulla il lavoro" (`CancelBookingModal`), senza nota.

**Verifica**: foto su computer e telefono in
`/mnt/project-files/agenda/giorno-per-giorno-fermo/chiudi-*.png`; prova e2e
nuova in `agenda-primo-uso.spec.ts` (conferma con un appuntamento, Annulla
lascia il giorno aperto); `agenda-accessibilita.spec.ts` verde.

**Intestazione del Calendario** (Luca, dall'iPhone: "Dom 15 allinealo agli
altri giorni"): un giorno senza fasce non aveva la riga delle ore libere
("11h") e il suo numero scendeva più in basso degli altri. Ora quella riga
c'è sempre (vuota e nascosta al lettore di schermo), così tutti i giorni
della settimana stanno alla stessa altezza.
