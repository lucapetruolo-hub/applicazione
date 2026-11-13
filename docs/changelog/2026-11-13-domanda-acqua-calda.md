# Domande sull'acqua solo quando il problema parla di acqua

**Richiesta** (Luca, 13/11/2026, "si"): per "il climatizzatore perde acqua dallo
split" il sito chiedeva "Che cosa scalda l'acqua o la casa?", che lì non c'entra.

**Decisione**: le domande del dizionario (`QUESTIONS` in
`packages/shared/src/problemMatch.ts`) possono avere parole che le escludono
(`unless`). La domanda dell'acqua calda non parte se il testo parla di
condizionatore, climatizzatore, split o aria condizionata.

Poi (Luca, 13/11, ricerca con foto "Uomo che tinteggia parete bianca con
rullo": imbianchino, ma chiedeva "Da dove sembra arrivare l'acqua o
l'umidità?"), regola generale: le domande sull'acqua ("macchia", "acqua-calda",
"perde-acqua") hanno un argomento (`topic`) e partono solo se il testo parla di
acqua, umidità, muffa, perdite, tubi o bagno. Prima bastava che il dizionario
trovasse due mestieri della coppia (qui "parete" dava imbianchino e muratore).

**Motivo**: "perde acqua" porta anche all'idraulico, e la coppia
climatizzazione-idraulico faceva partire la domanda sul riscaldamento.

**Verifica**: test di `packages/shared` verdi; "lo scaldabagno perde acqua" e
"la caldaia non fa acqua calda" fanno ancora la domanda.
