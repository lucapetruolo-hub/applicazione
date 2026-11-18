# 18/11/2026 — Le voci del preventivo restano nell'ordine in cui le scrive il professionista

**Richiesta** (Luca, thread del meteo, PR #409): la prova
`e2e/tests/voci-prezzo-colonna.spec.ts` è fallita una volta e passata la
seconda ("Manodopera" sopra "Sostituzione sifone"). Luca: sistemarla in un
thread a parte.

**Causa**: le voci (`QuoteItem`) non avevano niente che ne ricordasse
l'ordine. Si leggevano senza `orderBy` (Postgres le dà nell'ordine che
preferisce) o con `orderBy: { id: "asc" }`, ma l'id è un UUID casuale. Non era
solo la prova: anche il cliente, la scheda del professionista e il PDF del
preventivo potevano mostrare le voci mescolate rispetto a come erano state
scritte.

**Decisione**
- Colonna nuova `quote_items.position` (`SERIAL`, migrazione additiva
  `20261118180000_ordine_voci_preventivo`): cresce da sola a ogni inserimento,
  anche dentro la `createMany` che salva le voci a ogni invio del preventivo,
  quindi nessun codice di scrittura cambia. Le voci già salvate prendono un
  numero all'arrivo della colonna.
- Tutte le letture che mostrano o restituiscono le voci le ordinano per
  `position` (cliente, professionista, admin, PDF, export dei dati, prima voce
  in "I miei clienti" e nell'agenda). Le letture che fanno solo la somma degli
  importi restano com'erano.
- La prova resta com'è.

**Verifica**: typecheck di `apps/api`; `prisma migrate diff` dà lo stesso SQL
della migrazione; su Postgres 16 una tabella di prova con `SERIAL` restituisce
le righe di una insert multipla nell'ordine scritto.
