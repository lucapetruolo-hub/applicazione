# Prova della chat che a volte falliva

**Richiesta di Luca (05/11/2026):** correggere a parte la prova "Chat: il numero
di telefono non parte prima dell'accettazione, dopo sì", fallita una volta sulla
PR della mappa a schermo intero (#241) e passata al secondo giro.

**Causa:** subito dopo "Invia" la prova cercava il testo del messaggio mentre era
ancora anche nel campo "Scrivi un messaggio": Playwright trovava due elementi e
si fermava.

**Correzione:** in `e2e/tests/admin-protezioni.spec.ts` la prova aspetta prima che
il campo si svuoti e poi cerca il messaggio, in entrambi gli invii. Nessuna prova
saltata o tolta, nessun cambio al sito.

**Verifica:** CI della PR.
