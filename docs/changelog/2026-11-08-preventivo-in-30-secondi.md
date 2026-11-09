# Preventivo in 30 secondi

**Richiesta**: funzione nuova 4 del controllo pre-lancio dell'08/11/2026
(`collaudo/2026-11-08/esperto-E10-prodotto.md`), approvata da Luca ("sì a
tutto quello che ritieni, tranne per le funzioni nuove la n. 12"). In un
mercato locale il primo che risponde prende il lavoro (CLAUDE.md §8), e oggi
il professionista riscrive ogni preventivo da zero dal telefono.

**Decisione**:
- Nel modulo del preventivo, sopra le voci, le prestazioni del profilo come
  pillole ("Dalle tue prestazioni"): un tocco aggiunge la voce con la sua
  forbice di prezzo, un secondo tocco la toglie. La riga vuota "Manodopera"
  con cui si apre il modulo viene sostituita, non resta in coda.
- Prima la prestazione che corrisponde alla descrizione del cliente, con la
  scritta "Adatta alla richiesta" (stesso `serviceMatchingProblem` della
  ricerca), poi quelle del mestiere della richiesta, poi le altre; al massimo 8.
- Il prezzo si copia solo per le prestazioni "a lavoro": "30–50 € al m²" non
  è il totale di un lavoro, lì la voce arriva senza cifre e il professionista
  scrive il prezzo.
- "Usa il preventivo di oggi / di ieri / del 5 novembre": riparte dall'ultimo
  preventivo mandato per lo stesso mestiere su un'altra richiesta (voci,
  prezzi e messaggio se vuoto), con la descrizione di quella richiesta per
  riconoscerlo e "Annulla" subito dopo.
- Senza prestazioni nel profilo una riga con il link "Aggiungile".
- Tutto resta modificabile prima di inviare: il prezzo è sempre del
  professionista (CLAUDE.md §5.18). Nessun dato nuovo nell'API: le
  prestazioni e i preventivi già mandati arrivavano già alla pagina.

**Dove**: `packages/shared/src/quoteQuickFill.ts` (ordine delle prestazioni,
voce da una prestazione, ultimo preventivo simile),
`apps/web/src/app/dashboard/richieste/_components/QuoteQuickFill.tsx`,
stili `.quick-*` in `globals.css`.

**Verifica**: `packages/shared/src/quoteQuickFill.test.ts` (ordine, al
massimo 8, prezzo solo "a lavoro", ultimo preventivo dello stesso mestiere);
prova nel browser `e2e/tests/preventivo-veloce.spec.ts` su telefono e
computer (tocco, voce al m² senza cifre, togliere, copiare e annullare, axe).

## Migliorie approvate da Luca (09/11)

- La riga "Manodopera" con cui si apre il modulo parte dal prezzo della
  "Manodopera" dell'ultimo preventivo mandato (qualsiasi mestiere), con la
  frase "La manodopera parte dal prezzo del tuo ultimo preventivo: cambialo
  se serve." (`lastLaborPrice` in `packages/shared/src/quoteQuickFill.ts`).
- Nel profilo, in "Prestazioni offerte", chi non ne ha legge "Aggiungi le
  prestazioni per rispondere più in fretta: nel preventivo le inserisci con un
  tocco."
- Il pulsante "Lavoro terminato" (cliente e professionista) passa da #20B2AA
  (contrasto 2,6 col bianco) a #0E7F7A (4,8, WCAG AA), sempre turchese.
