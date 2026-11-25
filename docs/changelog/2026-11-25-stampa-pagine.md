# Stampa di Termini, Privacy e delle altre pagine

**Richiesta** (Luca, 25/11/2026, thread "Preparare la cartella per il
commercialista"): preparando i PDF per il commercialista, stampare Termini e
Privacy dal browser dava una pagina bianca. Luca ha detto sì alla correzione.

**Causa**: la regola di stampa delle fatture (`docs/CHANGELOG.md` §378) in
`apps/web/src/app/globals.css` nascondeva `body *` su tutte le pagine e
mostrava solo `.print-document`. Le pagine senza documento (Termini, Privacy,
pagina prezzi, qualsiasi altra) restavano vuote.

**Decisione**: la regola nasconde il resto solo se la pagina ha un documento:
`body:where(:has(.print-document)) *`. `:where` tiene il peso del vecchio
`body *`, così `.print-document *` continua a vincere e fatture, estratti,
copie di cortesia e DAC7 si stampano come prima. Le altre pagine si stampano
come si vedono.

**Verifica**: pagina di prova con il blocco di stampa vero, in Chromium in
modalità stampa: senza `.print-document` titolo e testo visibili (prima
vuota); con `.print-document` solo il documento, menu e pulsanti
`data-print-hide` nascosti. Una prima versione con `body:has(...)` nascondeva
anche il documento (pesava più di `.print-document *`): scartata.
