# Tornare indietro dopo un deploy sbagliato

**Ordine:** prima l'API, poi il sito, poi si ragiona con calma.

## 1. API (Render), 1-2 minuti

Render → servizio `professionisti-api-eu` → **Events** → il deploy precedente
che funzionava → **Rollback**. Usa la versione già costruita: niente build.

**Limite: le migrazioni non tornano indietro.** Il codice vecchio funziona
solo se il database non ha perso colonne o tabelle che quel codice usa. Per
questo (CLAUDE.md §2) le migrazioni sono solo **additive**: nuove colonne e
tabelle sì; un `DROP` o un `RENAME` si fa in una PR a parte, almeno un deploy
dopo il codice che non usa più quella colonna. Prima di tornare a un deploy,
guardare se nel mezzo c'è una migrazione con `DROP`/`RENAME`
(`packages/database/prisma/migrations/*/migration.sql`): se c'è, il rollback
dell'API non basta e serve una correzione in avanti.

Se il deploy nuovo è fallito (build o migrazione), Render lascia già in linea
la versione di prima: non serve fare nulla, solo capire l'errore nei log.

## 2. Sito (Vercel), meno di un minuto

Vercel → progetto → **Deployments** → il deploy precedente → **⋯ → Instant
Rollback** (c'è anche sul piano gratuito). Le variabili `NEXT_PUBLIC_*`
restano quelle di quel deploy.

## 3. Dati

Se il problema sono i dati (cancellati o scritti male), il rollback non
basta: [ripristino.md](ripristino.md).

## Il giorno del lancio

Prima di ogni deploy importante annotare l'identificativo del deploy in
linea su Render e su Vercel: è quello a cui tornare. Fare i deploy fuori
dalle ore delle attività a orario più delicate (le 7, le 8 e le 9 del 1° del
mese, vedi [attivita-a-orario.md](attivita-a-orario.md)).
