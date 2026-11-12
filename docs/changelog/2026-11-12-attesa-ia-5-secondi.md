# L'IA della ricerca ha 5 secondi per rispondere, non 3

**Richiesta** (Luca, 12/11/2026): proseguire da esperto dopo il passaggio a
Claude Haiku.

**Misura**: un solo giro sul sito vero con tutte le 376 frasi dubbie
(`analisi/abbinamento-problema/misura-ia/risultato.md`).
- Sulle frasi del mucchio chiuso il primo mestiere è giusto nell'86% dei casi
  (72% con il modello gratuito di prima).
- Haiku risponde in 2,3 s di mediana, ma 100 frasi su 376 (27%) hanno superato
  i 3 s di attesa e sono rimaste al dizionario. Quando Haiku fa in tempo è
  giusto nel 94% dei casi, quando resta il dizionario nel 67%.
- La risposta più lenta vista è stata di 3,4 s.

**Decisione**: `TIMEOUT_MS` da 3000 a 5000 in
`apps/api/src/problem-match/problem-match.service.ts`. Una ricerca dubbia su 4
mostra i risultati 1-2 secondi dopo, con la barra di caricamento che c'è già;
le frasi già cercate restano subito pronte (memoria delle ultime 500).

**Verifica**: test di `problem-match` verdi; dopo l'unione si rifà il giro
delle 376 frasi e si contano le risposte arrivate tardi.

## "Sto pensando…" durante l'attesa

**Richiesta** (Luca, 12/11/2026): durante l'attesa più lunga una frase del
tipo "sto pensando".

**Decisione**: la frase dell'attesa della ricerca dal problema resta "Cerco
chi ti serve…" e dopo 1,5 secondi diventa "Sto pensando a chi può aiutarti…"
(`useThinkingLabel` in `apps/web/src/lib/useThinkingLabel.ts`), sia nella
barra in cima sia nel riquadro della home. Le ricerche veloci non la vedono
mai; quelle che aspettano l'IA capiscono perché aspettano.

## Migliorie 1, 2, 3 e 5 della ricerca

**Richiesta** (Luca, 12/11/2026, "ok 1-5" sulle migliorie in
`analisi/abbinamento-problema/migliorie-ricerca-2026-11-12.md`).

1. **"Non è un lavoro" meno facile.** Nella misura 12 errori di Haiku su 21
   erano frasi come "Perché viene la muffa sul muro?" lette come domande e non
   come lavori. Ora, se l'IA dice "non è un lavoro" ma il dizionario ha trovato
   un mestiere, si tiene il mestiere del dizionario (`combine` in
   `problem-match.service.ts`); le istruzioni dicono che una domanda o un
   consiglio su un problema della casa è una richiesta di lavoro, con tre
   esempi. Le frasi davvero fuori servizio restano fuori servizio.
2. **Tempi dell'IA in Admin.** Ogni ricerca salva quanto ha aspettato l'IA
   e come è finita (`aiMs`, `aiOutcome`: ok, tardi, errore, tetto; migrazione
   `20261112170000_tempi_ia`, solo colonne nuove). In "Mestieri richiesti" una
   riga dice, per gli ultimi 7 giorni, a quante ricerche dubbie ha risposto
   l'IA, in quanti secondi di solito e quante sono arrivate tardi; sopra il 10%
   di problemi la riga si vede di più.
3. **Banco di prova fisso.** `pnpm --filter @professionisti/api banco-ia`
   (`apps/api/scripts/banco-ia.mjs`) manda le stesse 376 frasi all'API e conta
   il primo mestiere giusto. Le frasi etichettate restano nella cartella del
   progetto, non nel repo pubblico. Riferimento di oggi: 86%, 94% quando
   risponde l'IA. Si rifà prima e dopo ogni cambio alle istruzioni o al
   modello; sotto il riferimento il cambio non si tiene.
5. **Tre esempi nelle istruzioni** presi dagli errori della misura: aloni o
   macchie sui mobili = pulizie; chiavi chiuse dentro = fabbro; macchia nera di
   calore o fumo sul muro = imbianchino.

La 4 (Haiku senza ragionamento) si prova dopo l'unione, misurando con il banco
prima e dopo.

**Verifica**: 45 test di `problem-match` verdi (nuovi: "non è un lavoro" con
mestiere del dizionario, esiti dell'IA salvati, conteggio dei tempi);
`banco-ia.mjs` provato sulle risposte del 12/11 (rifà 86% e 94%).
