# "Lavoro terminato" già chiesto: la voce resta nel menu, grigia (20/11/2026)

**Richiesta** (Luca, dalla prova: "non esce sempre Lavoro terminato al
professionista"; poi "sì alla 6.1"): dopo che il professionista ha premuto
"Lavoro terminato" prima del giorno fissato, la voce spariva dal menu della
scheda e sembrava un difetto.

**Decisione**: finché si aspetta la conferma del cliente la voce resta nel
menu con l'orologio, grigia, con sotto "In attesa del cliente". Si legge ma
non si preme (`waiting` in `CardAction`, `aria-disabled`). Appena il cliente
conferma torna la voce normale, che chiede l'importo finale.

**Non fatto** (scelta di Luca, non riproporre): togliere dal cambio data la
fascia di oggi già iniziata.

**File**: `apps/web/src/components/CardActionsMenu.tsx`,
`apps/web/src/app/dashboard/richieste/_components/RequestCard.tsx`.

**Verifica**: prova `e2e/tests/sposta-e-terminato-in-anticipo.spec.ts` (la
voce c'è ed è segnata non premibile); typecheck e lint.
