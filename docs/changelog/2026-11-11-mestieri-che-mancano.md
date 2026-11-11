# Mestieri che non abbiamo, per numero e zona

**Richiesta** (Luca, 11/11/2026): sapere dal pannello admin quando
l'intelligenza artificiale vorrebbe proporre un mestiere o un lavoro che il
sito non offre ancora, quando sono tanti e in che zona.

**Cosa c'era già**: in Mestieri richiesti › Descrizioni dei clienti i "Lavori
che non copriamo" contati, ma solo per gli 8 lavori fissi
(`OUT_OF_SERVICE_LABELS`), e i "Cercati ma non capiti" raggruppati solo per
frase identica. La città c'era solo riga per riga. Nessun avviso.

**Decisione**:
- L'IA risponde anche `missingTrade`: quando nessun mestiere del sito va bene
  e il testo chiede un lavoro, il nome del mestiere che servirebbe ("Sarto").
  Non va al sito: resta nel registro delle descrizioni
  (`problem_descriptions.missingTrade`, migrazione
  `20261111220000_mestiere_mancante`, solo additiva). Per gli 8 lavori fissi
  si salva sempre il loro nome, così si contano insieme. Un nome che è già un
  mestiere del sito, con numeri o simboli, o più lungo di 4 parole si scarta
  (`cleanMissingTrade` in `packages/shared/src/missingTrades.ts`).
- Riquadro "Mestieri che non abbiamo, ultimi 30 giorni" in Mestieri richiesti:
  per ogni mestiere quante richieste e le 3 province con più richieste
  ("Latina e provincia 7 · Roma e provincia 5"), dal comune scritto nella
  ricerca. Nella tabella, al posto di "Non capita", "Mestiere che non
  abbiamo: Sarto".
- Consiglio in Home Admin / Andamento (stesso percorso degli altri consigli,
  `buildSiteAdvice`) quando un mestiere arriva a `MISSING_TRADE_ADVICE_MIN` =
  10 richieste in 30 giorni, contate dal lancio (§395), al massimo 2 alla
  volta, con il link `#mestieri-mancanti`. Niente email agli admin
  (decisione di Luca del 27/10).
- Il consiglio "Cercano «…», un lavoro che non c'è" diceva di cercare
  professionisti "a Latina": ora "nelle zone dove lo cercano" (sito per tutta
  Italia).

**Perché**: prima un mestiere chiesto in 15 modi diversi non si vedeva mai
come "tanti"; ora si conta per nome e si vede dove serve.

**Verifica**: test in `packages/shared/src/missingTrades.test.ts`,
`apps/api/src/problem-match/problem-match.service.test.ts` (il campo non esce
dalla risposta pubblica) e `apps/api/src/admin/site-stats.test.ts` (soglia e
testo del consiglio).
