# Luci colorate su "Descrivi il lavoro" solo quando lavora l'IA

**Richiesta** (Luca, 18/11/2026): nella richiesta di preventivo a un
professionista scelto o a un gruppo di scelti, la casella "Descrivi il lavoro"
mostrava ancora le luci colorate che girano, il segno dell'IA. Lì l'IA non
lavora (già scelto a chi va la richiesta), quindi le luci non servono.

**Decisione**: la luce resta solo quando il modulo usa davvero i suggerimenti
(dizionario + IA, `suggestionsOn`). Con `professionista`, `scelti` o in attesa
di un mestiere senza iscritti la casella prende la classe
`guided-description-input--semplice`: bordo 1px come gli altri campi del
modulo (#8E867C) e verde pieno di marca mentre si scrive, come già oggi con
l'IA. Nessun altro segno dell'IA restava in quel percorso: esempi "Prova:",
"Sto capendo chi ti serve…", domanda di chiarimento e IA sulla foto erano già
spenti (docs/changelog/2026-11-17-avviso-sicurezza-richiesta-diretta.md e PR #389);
l'avviso di sicurezza piccolo resta.

**Motivo**: un segno visivo che promette l'IA dove l'IA non c'è confonde e
toglie valore alla luce dove invece lavora.

**Verifica**: Playwright su `/preventivo` generale (luce con `label-badge-spin`),
con un professionista e con 2 scelti (bordo 1px, nessuna animazione), da
telefono e computer, anche mentre si scrive.
