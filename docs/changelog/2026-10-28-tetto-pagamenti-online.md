# Tetto ai pagamenti online (28/10/2026)

**Richiesta di Luca** (thread "Provare i pagamenti con Stripe di prova"):
Luca ha chiesto come limitare il rischio della piattaforma. Con Express la
piattaforma risponde dei saldi negativi, e il solo caso che il blocco dei
soldi fino alla conferma non copre è la contestazione in banca arrivata dopo
lo sblocco (fino a circa 120 giorni), con il saldo Stripe e la banca del
professionista vuoti. Analisi di come fanno gli altri siti in
`/mnt/project-files/analisi/stripe-prova/tetto-professionisti-nuovi.md`.

**Decisione di Luca** (dopo aver scartato un tetto a più livelli): un tetto
unico.
- **2.000 € a lavoro** chiesti online, tra acconto e saldo.
- Il tetto **sparisce dopo 10 lavori** pagati online, con i soldi già passati
  al professionista e senza contestazioni in banca, se il primo di questi è
  di **almeno 120 giorni** prima.
- Il pagamento diretto resta libero.
- Una contestazione in banca persa fa ripartire il conto: contano solo i
  lavori pagati dopo.
- L'admin (Finanza) può togliere il tetto a chi conosce; una contestazione
  persa lo rimette.

**Cosa cambia**
- `packages/shared/src/onlineLimit.ts`: regole, testi e schema.
- `apps/api/src/job-payments/online-limit.ts`: conto dei lavori.
- Preventivo (`quotes.service.ts`): un modo online che supera il tetto viene
  rifiutato con la frase da seguire, per esempio "scegli Acconto online e
  saldo diretto". Il modulo fa lo stesso controllo prima dell'invio e mostra
  il tetto sotto l'acconto.
- Chiusura del lavoro (`bookings.service.ts`): un lavoro pagato tutto online
  non si chiude sopra il tetto. Il resto si paga in diretto.
- Contestazione persa (`online-money.service.ts`): azzera
  `ProfessionalProfile.onlineLimitRemovedAt`.
- Admin → Pagamenti: sezione "Tetto ai pagamenti online" con "Togli il
  tetto" / "Rimetti il tetto", scritti nel registro azioni.
- Termini, punto sui pagamenti: una frase sul tetto.
- Migrazione `20261028123000_tetto_pagamenti_online`.

**Da fare prima**: la prova nella sandbox di un conto Express con le perdite
a carico di Stripe (`analisi/stripe-prova/standard-o-express.md`). Il tetto
si fa comunque, per decisione di Luca.

**Verifica**: `online-limit.test.ts` (conto dei lavori, contestazione persa,
120 giorni, tetto tolto dall'admin, frasi del preventivo),
`online-limit-completion.test.ts` (chiusura sopra il tetto) e il caso nuovo
in `stripe-disputes.test.ts`. Tutti i test dell'API (894), `tsc` e lint di
API e sito.
