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

**Verifica**: foto su computer e telefono in
`/mnt/project-files/agenda/giorno-per-giorno-fermo/chiudi-*.png`; nomi dei
pulsanti per il lettore di schermo invariati (le prove e2e li usano).
