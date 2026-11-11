# "Ripeti la richiesta" ripropone i professionisti scelti, con la X

**Richiesta** (Luca, 10/11/2026): "Quando si clicca su ripeti la richiesta, se
si è inviata inizialmente ad un professionista specifico o più dovrebbero
comparire lui/loro con una X per eliminarli".

**Decisione**:
- "Ripeti la richiesta" (pulsante della scheda e menu ≡ in Le mie richieste)
  apre il modulo con gli stessi destinatari della richiesta di partenza: il
  professionista della richiesta diretta, oppure i 2-5 scelti nei risultati
  (§393). L'API ora dà al cliente anche `chosenProfileIds` delle sue richieste.
- Nel modulo ogni professionista ha una X ("Togli … dalla richiesta", 44 px da
  toccare). Vale anche quando si arriva dai risultati o dal profilo: è lo
  stesso riquadro, nessuna strada a parte. Togliendone uno tra due resta la
  richiesta diretta all'altro; togliendo l'ultimo diventa una richiesta
  generale ai professionisti della zona. Il link si riscrive con la stessa
  funzione dei risultati (`apps/web/src/lib/chosenParams.ts`), così descrizione,
  indirizzo e contatti già scritti restano. Una riga sotto il riquadro dice
  cosa è cambiato (letta anche dai lettori di schermo).
- Chi non è più sul sito (eliminato, sospeso, profilo non più pubblico) si
  toglie da solo all'apertura, con la riga "Un professionista che avevi scelto
  non è più sul sito: l'abbiamo tolto." (prima la richiesta veniva rifiutata
  solo all'invio). Chi è in pausa resta in vista con l'avviso, che ora dice
  "toglilo con la X" invece di "torna ai risultati".
- Togliendo il professionista diretto si toglie anche l'orario scelto nella sua
  agenda (valeva solo per lui) e la casella "inoltra ad altri" torna com'era.
- I bollini lato professionista ("Solo per te", "Scelto tra N", PR #309)
  restano coerenti da soli: la richiesta ripetuta passa dallo stesso invio.

**Verifica**: `e2e/tests/ripeti-richiesta-scelti.spec.ts` su telefono e
computer (scelti riproposti, uno non più sul sito tolto da solo, X fino alla
richiesta generale con la descrizione che resta; richiesta diretta riproposta).
