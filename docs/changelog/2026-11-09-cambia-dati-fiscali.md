# "Cambia" nei Dati fiscali non sembra più già premuto

**Richiesta** (Luca, 09/11/2026, con screenshot): in Fisco e pagamenti → Dati
fiscali, il pulsante "Cambia" nella pillola "Privato, senza Partita IVA"
sembrava già cliccato.

**Causa**: la classe `.plan-chip-change` era scritta per un link (la pillola
del piano scelto, `ChosenPlanChip`). In Dati fiscali la stessa classe è su un
`<button>`, e il browser gli aggiungeva il suo fondo grigio e il bordo scuro.

**Decisione**: in `globals.css` la classe toglie l'aspetto da pulsante del
browser (fondo, bordo, `appearance`) e prende il carattere della pagina. Ora
"Cambia" è lo stesso link verde sottolineato della pillola del piano e di
"Cambia" in registrazione, con una sottolineatura più spessa al passaggio del
mouse. Il link del piano non cambia.

**Verifica**: pagina di prova con lo stesso CSS a 600 e 390 px di larghezza:
le due pillole mostrano "Cambia" identico, senza fondo né bordo.

## Migliorie approvate da Luca (09/11/2026)

- **Area da toccare di 44 px**: un riquadro invisibile (`::after`) attorno a
  "Cambia" lo rende comodo col dito senza ingrandire la pillola. Vale anche
  per "Cambia" nella pillola del piano.
- **"Cambia" a 16 px in Dati fiscali** (`.plan-chip-change.is-large`), come il
  testo della pillola; nella pillola del piano resta a 13 px come il suo testo.

**Verifica**: nella pagina di prova il riquadro è alto 44 px e largo almeno
44; un tocco 6 px sopra la scritta prende ancora "Cambia".
