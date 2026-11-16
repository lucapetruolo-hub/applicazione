# Domande frequenti: da 8 a 59, per clienti e professionisti

**Richiesta** (Luca, 16/11/2026, thread "Ampliare le domande frequenti"): dopo
lo studio sull'assistente IA (`analisi/assistente-ia-sul-sito.md` nei file del
progetto), fare solo la base di risposte scritte, **senza IA per ora**.

**Decisione**:
- Fonte unica `packages/shared/src/faq.ts` (`FAQ`, `FAQ_TOPICS`,
  `faqForAudience`, `faqByIds`): 30 domande per chi cerca e 29 per i
  professionisti, in cinque argomenti ciascuno. I numeri (giorni, ore,
  prezzi, percentuali, tetti) vengono dalle costanti, mai scritti a mano. Le
  vecchie 8 (`HomeFaq.tsx`, `WhatIfSection.tsx`) e le 10 di
  `/per-professionisti` e `/per-professionisti/pagamenti` ora le prendono da
  qui per `id`: stesso testo, nessun doppione. `WhatIfSection.tsx` tolto. Le due domande della home stanno in
  `faqHome.ts`, così la home non scarica tutte le altre risposte.
- `/faq`: scelta in alto "Per chi cerca" / "Per i professionisti", argomenti
  come titoli, campo "Cerca tra le domande" (inizio di parola, senza accenti,
  senza IA), "Non hai trovato la risposta? Scrivici" in fondo.
  `?per=professionisti` apre la parte giusta (link "Tutte le domande" da
  `/per-professionisti`), un professionista che ha fatto l'accesso la trova
  già aperta, `#id` apre e illumina una domanda (ancore stabili per i link
  futuri). Le domande sui pagamenti online spariscono o cambiano testo finché
  i pagamenti online sono spenti; quella dei mesi gratis solo con un'offerta
  attiva (letta come in `/per-professionisti`). I link all'area del
  professionista compaiono solo a chi è professionista.
- Regole dei testi: solo fatti in funzione (Termini, `/problemi-e-rimborsi`,
  codice), mai "garantiamo" né prezzi decisi da noi (CLAUDE.md §5 punto 18),
  contatti del cliente solo dopo l'accettazione (§5 punto 9).

**Motivo**: un assistente risponde bene solo con risposte scritte; e già da
sole tolgono messaggi ai Contatti, soprattutto dai professionisti bloccati.

**Verifica**: `packages/shared/src/faq.test.ts` (id unici, argomenti validi,
`{mesi}` solo nella domanda dei mesi gratis, risposte brevi, ordine),
`pnpm lint` (anche frasi da intermediario) e `typecheck` di `apps/web`,
`next build` con `controlla-js-pagine-pubbliche.mjs` verde (`/faq`
303 KB compressi, home 342 KB), anteprime da telefono e computer in `anteprime/domande-frequenti/`.
