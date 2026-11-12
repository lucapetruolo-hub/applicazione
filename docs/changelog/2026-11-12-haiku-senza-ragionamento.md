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
