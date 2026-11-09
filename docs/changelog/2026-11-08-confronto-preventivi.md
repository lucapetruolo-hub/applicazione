# Confronto dei preventivi fianco a fianco

**Richiesta**: funzione nuova 8 del controllo pre-lancio dell'08/11/2026
(`collaudo/2026-11-08/esperto-E10-prodotto.md`), approvata da Luca. Con più
preventivi il cliente oggi li scorre uno sotto l'altro e confronta a memoria
prezzo, data e pagamento.

**Decisione**:
- In "Preventivi ricevuti", da 2 preventivi ancora accettabili (mandati o con
  una data proposta dal cliente) e senza un lavoro già scelto, il pulsante
  "Confronta i N preventivi".
- Si apre una finestra con una tabella vera (intestazioni di colonna con
  foto e nome, intestazioni di riga): Prezzo, Quando, Pagamento (solo i modi
  che il cliente può davvero scegliere), Se annulli, Recensioni, Verificato,
  Voci con il messaggio del professionista.
- Due segni sui numeri scritti dai professionisti: "Prezzo più basso" (il
  massimo della forbice più basso, a parità il minimo) e "Data più vicina";
  nessun segno se sono tutti uguali o se un preventivo non ha prezzo. Nessun
  "consigliato": la scelta è del cliente (CLAUDE.md §5.18). In fondo "Prezzi
  e date sono scritti da ciascun professionista".
- "Vedi e accetta" chiude la finestra e porta al preventivo nella pagina,
  evidenziato e con il focus: si accetta sempre dal percorso di sempre
  (riepilogo, pagamento, impegno), mai dalla tabella.
- Da telefono la finestra prende tutto lo schermo, la colonna delle voci e la
  riga dei nomi restano ferme mentre si scorre, e con 3 preventivi o più
  "Scorri di lato per vederli tutti". Escape chiude e il focus torna al pulsante.
- Nessun cambio all'API: i dati c'erano già nella pagina.

**Dove**: `packages/shared/src/quoteComparison.ts`,
`apps/web/src/app/le-mie-richieste/_components/QuoteCompareModal.tsx`,
`GuidedRequestCard.tsx`, stili `.quote-compare-*` in `globals.css`.

**Verifica**: `packages/shared/src/quoteComparison.test.ts`; prova nel
browser `e2e/tests/confronto-preventivi.spec.ts` su telefono e computer
(segni giusti, Escape e focus, "Vedi e accetta" porta al preventivo, axe;
con un solo preventivo il pulsante non c'è).
