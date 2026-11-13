# Domanda "Che cosa scalda l'acqua?" solo quando c'entra

**Richiesta** (Luca, 13/11/2026, "si"): per "il climatizzatore perde acqua dallo
split" il sito chiedeva "Che cosa scalda l'acqua o la casa?", che lì non c'entra.

**Decisione**: le domande del dizionario (`QUESTIONS` in
`packages/shared/src/problemMatch.ts`) possono avere parole che le escludono
(`unless`). La domanda dell'acqua calda non parte se il testo parla di
condizionatore, climatizzatore, split o aria condizionata.

**Motivo**: "perde acqua" porta anche all'idraulico, e la coppia
climatizzazione-idraulico faceva partire la domanda sul riscaldamento.

**Verifica**: test di `packages/shared` verdi; "lo scaldabagno perde acqua" e
"la caldaia non fa acqua calda" fanno ancora la domanda.
