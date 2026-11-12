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
