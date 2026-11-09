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
