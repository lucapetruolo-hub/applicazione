# Copia esterna del database: giro pronto, spento finché mancano le chiavi (20/11/2026)

**Richiesta** (Luca, 20/11: "fai il punto 4"): la copia esterna del database
decisa il 16/11 (una a settimana, cifrata, su Backblaze B2 in UE, 30 giorni)
era rimasta solo una riga nella checklist.

**Decisione**: `.github/workflows/copia-database.yml`, la domenica alle 03:15
UTC e a mano. Legge la versione del database e usa `pg_dump` della stessa
versione, cifra con `gpg` (AES-256) senza mai scrivere la copia in chiaro sul
disco, controlla che non sia vuota e la carica nel bucket. Rifiuta un
indirizzo che non sia di Backblaze in UE. Senza segreti il giro si salta e
resta verde; se fallisce diventa rosso e GitHub manda l'email. I 30 giorni li
fa rispettare il bucket (regola di scadenza), così la chiave può essere di
sola scrittura.

**Cosa resta a mano** (non si può fare da qui): account e bucket B2, chiave,
frase per cifrare, segreti su GitHub, Backblaze tra i fornitori della Privacy
il giorno dell'accensione, una prova di ripristino. Passi in
`docs/ops/copia-esterna.md`; checklist di lancio punto 28 aggiornata. Resta la
scelta di Luca: si accende con il database Basic, non prima.

**Verifica**: il file è YAML valido e lo controllano i giri di sicurezza della
PR. Il giro vero non è stato provato: servono l'account B2 e le chiavi.
