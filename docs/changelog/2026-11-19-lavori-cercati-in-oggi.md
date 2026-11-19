# "Lavori cercati vicino a te" in Oggi e avviso sul sito (proposte A e B)

**Richiesta (Luca, 19/11/2026):** dalla versione profonda
`analisi/lavori-cercati-ai-professionisti-versione-profonda.md` Luca ha scelto
le proposte A, B, C, D, E e G ("unisci ogni volta che lo ritieni"). Questa voce
copre A e B, la parte del professionista già iscritto.

**Cosa cambia**
- *A. Riquadro in Oggi:* "Lavori cercati vicino a te", con le richieste in
  bacheca a cui il professionista può rispondere (stesse regole di
  "Rispondi": mestiere, entro 100 km, online solo a chi lo offre) e che non
  gli sono arrivate, le più vicine prima, al massimo 3, con i km dalla sua
  zona e "Rispondi". Senza richieste il riquadro non c'è. API
  `GET /request-board/near-me` (con accesso; per un cliente risponde vuoto).
- *B. Avviso sul sito:* quando il giro orario mette in bacheca richieste
  nuove, ogni professionista visibile che può rispondere a una di queste
  riceve un avviso (campanella e popup), uno solo per giro anche con più
  richieste ("e altre N"). Tipo `BOARD_NEARBY`, avviso "Lavori cercati vicino
  a te" in Notifiche, solo sul sito (l'email resta quella del lunedì). Tocca
  e apre "Rispondi" (una richiesta) o la pagina con la mappa (più di una).
  Niente notifica sul telefono a sito chiuso: servirebbe il push del browser,
  un servizio nuovo da decidere a parte; WhatsApp no per regola.
- Le regole di chi può rispondere stanno in un punto solo
  (`replyableRequests`, `matchesFor`) per l'email del lunedì, il riquadro e
  l'avviso.

**Motivo:** chi è già iscritto riceve da solo le richieste nel suo raggio; la
bacheca gli serve per quelle tra il raggio e i 100 km, e serve saperlo subito.

**Verifica:** typecheck di API e sito, lint, `request-board-client.test.ts`
(riquadro: solo mestiere ed entro 100 km, più vicine prima, mai una già
ricevuta, nessuna senza profilo; avviso: uno per giro con il numero, niente se
già ricevuta o se non riceve richieste).
