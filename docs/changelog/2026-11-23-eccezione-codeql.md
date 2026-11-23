# CodeQL: un'eccezione scritta per il falso allarme sull'impronta dell'email (23/11/2026)

**Richiesta**: dopo la PR #461 restava una segnalazione di CodeQL sul ramo
principale, `js/insufficient-password-hash` in
`apps/api/src/common/email-fingerprint.ts`. Luca ha scelto, sulla scheda di
decisione, "Eccezione mirata e scritta".

**Decisione**: il passo "Nessuna segnalazione nuova" di
`.github/workflows/security.yml` legge `.github/codeql-eccezioni.json` e non
blocca solo le segnalazioni con quella regola in quel file; le stampa come
"Eccezione scritta". Ogni altra segnalazione blocca come prima, anche della
stessa regola in un altro file.

**Motivo**: è un falso allarme. La funzione calcola l'impronta con chiave
segreta di un indirizzo email (account chiusi, righe di log), non di una
password: le password usano bcrypt. CodeQL la collega alle email "password
cambiata" e "password dimenticata" solo per il nome. Con il controllo sempre
rosso un allarme vero non si notava più.

**Regola**: un'eccezione nuova in quel file si aggiunge solo con l'ok di Luca
e con il motivo scritto.

**Verifica**: il passo provato in locale con un risultato finto: la regola in
quel file passa, la stessa regola in un altro file blocca.
