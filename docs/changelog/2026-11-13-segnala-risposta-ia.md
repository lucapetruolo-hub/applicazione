# "Segnala un errore" sotto la proposta dell'intelligenza artificiale

**Richiesta** (Luca, 13/11/2026): "dai la possibilità di segnalare la risposta
dell'ai da parte dell'utente".

**Decisione**:
- Nei risultati della ricerca per problema, sotto "Suggerimento
  dell'intelligenza artificiale: può sbagliare…", il link "Segnala un errore" (solo
  quando la proposta viene dall'IA). Il cliente sceglie "Il mestiere è
  sbagliato", "Il lavoro indicato è sbagliato" o "Altro" e può aggiungere una
  nota (300 caratteri, numeri ed email tolti come nel testo del problema).
- `POST /problem-match/report` (5 al minuto per IP) segna la ricerca salvata in
  `problem_descriptions` (`reportedAt`, `reportReason`, `reportNote`, migrazione
  solo additiva): una volta sola, solo sulle proposte dell'IA, e risponde
  sempre allo stesso modo anche con un id che non esiste. L'id arriva nella
  risposta di `POST /problem-match` (`reportId`).
- Admin › Mestieri richiesti: riquadro "Segnalate dai clienti, ultimi 30
  giorni" (le ultime 50). Solo da leggere: l'IA non impara da sola (decisione
  di Luca del 6/11), si corregge a mano.

Nello stesso giro: la domanda "Che cosa scalda l'acqua o la casa?" non parte
più per un condizionatore (docs/changelog/2026-11-13-domanda-acqua-calda.md).

**Verifica**: test dell'API (proposta dell'IA con id, dizionario senza; una
segnalazione sola, nota senza numero di telefono), typecheck e lint del sito.
