# Nomi dei mestieri nella ricerca e nome dell'attività senza desinenza

**Richiesta** (Luca, 04/11/2026, thread "Chiarire l'iscrizione di un
termoidraulico"): un cliente che cercava "termoidraulico" non trovava
nessuno. La parola non è una categoria, il dizionario dei problemi cerca le
parole che *iniziano* con "idraulic" e, con una parola sola, partiva la
ricerca per nome dell'attività, che voleva il testo esatto ("termoidraulico"
non trovava "Termoidraulica Rossi"). Luca ha chiesto le due correzioni.

**Decisione**:
- `TRADE_NAMES` in `packages/shared/src/problemMatch.ts`: nomi di mestieri
  che il sito non usa come categoria e le categorie a cui portano.
  "Termoidraulico" porta a Idraulico e Climatizzazione e caldaie (la prima in
  testa, la seconda in "Oppure"); "impiantista" a Idraulico, Elettricista e
  Climatizzazione; poi stagnino, caldaista, frigorista, condizionatorista,
  manutentore caldaie, piastrellista, cartongessista, pavimentista,
  capomastro, tinteggiatore, decoratore, fabbri, ebanista, serramentista,
  mobiliere, giardinaggio, manutentore del verde, vivaista, potatore,
  traslocatore, sgomberatore, factotum, manutentore, petsitter, dog walker,
  bambinaia. Un nome di mestiere dice già chi serve: niente domanda,
  dizionario "sicuro" (quindi niente intelligenza artificiale) e il nome più
  lungo vince ("manutentore caldaie" è il caldaista, non il Tutto Fare). La
  caldaia scritta accanto al nome passa davanti ("termoidraulico per la
  caldaia" → Climatizzazione e caldaie prima). "Edile" escluso: "un'impresa
  edile ha installato le tapparelle" del banco di prova diventava muratore
  sicuro. "Fabbri" solo come parola intera ("fabbricato" non è il fabbro).
- Una parola sola come "termoidraulico" ora va alla pagina dei risultati per
  problema ("Ti serve un idraulico", "Oppure: Climatizzazione e caldaie"),
  perché `looksLikeProblem` la riconosce.
- Ricerca per nome dell'attività (`nameSearchWords` in
  `packages/shared/src/nameSearch.ts`, usata da `ProfessionalsService.search`):
  ogni parola di almeno 5 lettere perde la vocale finale, le corte restano
  intere, il nome deve contenerle tutte in qualunque ordine.

**Verifica**: banco di prova delle 769 frasi identico a prima (stesso
mestiere, stessa sicurezza, stessa domanda per ogni frase); test nuovi in
`problemMatch.test.ts` e `nameSearch.test.ts`; typecheck dell'API.
