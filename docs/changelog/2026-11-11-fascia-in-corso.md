# Fascia di oggi già cominciata: non è "già passata"

**Richiesta** (Luca, 11/11/2026, con foto): alle 14:20, sulla data proposta dal
cliente "mercoledì 11 novembre 14:00–20:00", il professionista premeva
"Accetta nuova data" e leggeva "La data proposta è già passata". Poi: invertire
"Descrizione lavoro" e "Dettagli cliente" nella scheda della richiesta.

**Causa**: i controlli dell'API guardavano solo l'ora d'inizio
(`inizio <= adesso` → passata). Con le fasce larghe (14:00–20:00) una fascia
appena cominciata ha ancora ore utili. Le fasce proposte nei moduli invece
seguivano già un'altra regola (`slotStillOffered`: almeno 2 ore prima della
fine, collaudo B-05/D-09), quindi il cliente poteva scegliere una fascia che
poi il professionista non riusciva ad accettare.

**Decisione**: una sola regola in tutto il sito, `appointmentStillAhead` in
`packages/shared/src/availability.ts`, sempre in ora italiana
(`wallClockNow`): un appuntamento si può proporre o accettare se non è ancora
cominciato, oppure se è una fascia già cominciata con almeno
`SLOT_MIN_HOURS_LEFT` (2) ore prima della fine. Vale per:
- preventivo nuovo del professionista (`QuotesService.create`);
- proposta di un'altra data del cliente, anche prima che il preventivo sia
  accettato (prima mancava del tutto: il professionista scopriva il problema
  solo premendo "Accetta nuova data");
- "Accetta nuova data" e "Modifica" del professionista, anche su un
  appuntamento già fissato;
- accettazione del preventivo da parte del cliente (`createFromQuote`): prima
  un preventivo con la data di ieri si accettava e nasceva un appuntamento nel
  passato. Non nel ritorno dal pagamento dell'acconto: a soldi già presi il
  lavoro nasce comunque;
- fasce proposte nei moduli (`slotStillOffered` con l'ora d'inizio): una fascia
  breve non ancora cominciata resta proposta (08:00–09:00 alle 07:30), prima
  spariva perché finiva entro due ore.

Non cambiati (restano "dall'ora d'inizio"): annullare o spostare un
appuntamento già fissato e riaprirlo. Lì l'inizio della fascia è l'impegno
preso con l'altro; proposto a Luca come miglioria facoltativa.

Scheda della richiesta (`RequestCard.tsx`): "Descrizione lavoro" prima di
"Dettagli cliente" (a sinistra da computer, sopra sul telefono).

**Verifica**: prove in `packages/shared/src/availability.test.ts` (14:20 con
14:00–20:00 sì, 14:00–16:00 no, ora legale), `proposed-date-accepted.test.ts`
(alle 14:20 si accetta, alle 18:30 no), `bookings.service.test.ts` (preventivo
con data passata rifiutato), prova nel browser `e2e/tests/fascia-in-corso.spec.ts`
(telefono e computer). Foto in anteprime/fascia-in-corso/.
