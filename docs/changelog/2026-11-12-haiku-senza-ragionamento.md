# Claude Haiku: ragionamento provato spento (torna acceso), e due esempi in più nelle istruzioni

**Richiesta** (Luca, 12/11/2026): miglioria 4 di
`analisi/abbinamento-problema/migliorie-ricerca-2026-11-12.md` ("sono d'accordo
con l'esperto"), e due esempi approvati nel thread "Collegare Claude Haiku e
WhatsApp di prova" dopo la rimisura delle 93 frasi.

**Decisione**:
- `thinking: { type: "disabled" }` nella chiamata a Claude Haiku
  (`callClaude` in `apps/api/src/problem-match/problem-match.service.ts`).
  Scegliere un mestiere è una classificazione: il ragionamento allunga i tempi
  e con 5 secondi di attesa conta.
- Nelle istruzioni: impianto del gas, bombola o gas gpl di casa = idraulico
  ("Dubbi su gas gpl domestico" restava senza mestiere); pulire calcare o
  sporco all'aperto non è la pulizia di cucina e bagno (prendeva quella
  prestazione).

**Verifica**: banco `pnpm --filter @professionisti/api banco-ia` sulle 376
frasi, prima (istruzioni della #336, ragionamento acceso) e dopo l'unione. Si
tiene solo se il primo mestiere giusto non scende e i tempi calano; altrimenti
si torna indietro. Risultati sotto.

**Risultato** (banco delle 376 frasi, mucchio chiuso, 81 frasi di lavoro):

| | Primo mestiere giusto | Risposte dell'IA in tempo | Secondi dell'IA (mediana / 9 su 10 entro) |
|---|---|---|---|
| Istruzioni della #336, ragionamento acceso | 91% (74/81) | 79/81 | 2,6 / 3,7 |
| Ragionamento spento (#343) | 86% (70/81) | 79/81 | 1,3 / 1,9 |

Spento risponde in metà tempo ma sbaglia 4 frasi in più e non ne indovina
nessuna in più ("Levigare il marmo" senza mestiere, un trasloco di mobili
preso per falegname, un balcone con grigliati preso per muratore, piccoli
lavori di bagno senza mestiere). Quindi **il ragionamento torna acceso**
(nella #345); i due esempi nuovi restano. Con il ragionamento acceso le
risposte stanno comunque dentro i 5 secondi. Risposte in
`analisi/abbinamento-problema/misura-ia/banco-2026-11-12-istruzioni-nuove.csv` e
`banco-2026-11-13-senza-ragionamento.csv`.

## Altre quattro migliorie della ricerca

**Richiesta** (Luca, 12/11/2026, "effettua migliorie tranne la 4 per ora",
nel thread "Collegare Claude Haiku e WhatsApp di prova"; la foto del problema
resta rimandata).

1. **Il cliente che cambia mestiere.** Quando nei risultati tocca un mestiere
   diverso dal primo proposto, `/cerca` lo manda all'API (`chosen`) e la
   ricerca lo salva in `chosenCategory` (migrazione
   `20261112230000_mestiere_scelto`, solo una colonna nuova). In "Mestieri
   richiesti" la riga "Il cliente ha cambiato mestiere: proposto X, scelto Y"
   con il conteggio dei 30 giorni. Solo da leggere: l'IA non impara da sola
   (decisione di Luca del 6/11), le parole si insegnano da "Da approvare".
2. **Cache di Anthropic.** Il catalogo dei servizi era già in ordine fisso; i
   nomi standard di Admin con la stessa data ora si ordinano anche per nome.
   Se per 20 richieste di fila Anthropic non legge le istruzioni dalla cache,
   il registro dell'API lo dice una volta (`PromptCacheWatch`).
3. **Quando e dove dal testo.** "urgente", "subito", "oggi" = Oggi;
   "domani", "in settimana" = In settimana; "non è urgente", "con calma" =
   Con calma (`timingFromProblem` in `packages/shared/src/problemHints.ts`).
   Il comune scritto dopo "a", "in", "zona" (`comuneFromProblem`, solo nomi
   ISTAT, niente stanze come "in casa") se la ricerca non ha già la città.
   Arrivano nella richiesta di preventivo (`quando`, `citta`) già scelti, e il
   cliente li può cambiare.
5. **Avviso quando l'IA è giù.** Se per 10 minuti nessuna risposta dell'IA va
   a buon fine, un avviso a chi gestisce il sito (`opsAlert`, Sentry) una
   volta sola, e di nuovo solo dopo che l'IA è tornata (`AiHealth`).

**Verifica**: 50 test di `problem-match` e 4 di `problemHints` verdi,
typecheck di API e sito ok.
