# Controlli di sicurezza rossi sul ramo principale: permesso `actions: read`

**Problema** (28/10/2026, dopo l'unione della PR #167): il workflow "Controlli di sicurezza" era rosso a ogni giro sul ramo principale (giri 40663612226, 40663966386, 40664555947). Semgrep e osv-scanner finivano l'analisi pulita, ma `codeql-action/upload-sarif` (e `analyze` per CodeQL) falliva con "Resource not accessible by integration" sulla chiamata "Get a workflow run". Le PR restavano verdi.

**Causa**: codeql-action legge i dati del giro del workflow, e il workflow dava al token solo `contents: read` e `security-events: write`. La #167 ha aggiunto il blocco `concurrency` al workflow, e da lì sul ramo principale l'azione chiede quei dati.

**Decisione**: aggiunto `actions: read` ai permessi di `.github/workflows/security.yml`. È il permesso in sola lettura del modello ufficiale di CodeQL. Nessun controllo cambiato: CodeQL, Semgrep, gitleaks e osv-scanner restano identici e bloccanti.

**Verifica**: controlli della PR verdi; dopo l'unione, giro dei controlli di sicurezza verde sul ramo principale.
