# Claude Haiku senza ragionamento, e due esempi in più nelle istruzioni

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
