# "Completa il profilo" in evidenza in Oggi

**Richiesta** (Luca, 05/11/2026): dopo una nuova registrazione da
professionista, nella pagina Oggi la sezione "Completa il profilo" a destra
si vede poco, ma è molto importante.

**Cosa succedeva**: sul computer il percorso stava nella colonna di destra,
accanto a tre sezioni vuote ("Nessun appuntamento", "Nessuna richiesta",
"Il tuo andamento") e al consiglio sulle recensioni. Sul telefono finiva sotto
"Oggi e domani". Un professionista appena iscritto vedeva prima il vuoto e poi
l'unica cosa che poteva fare.

**Decisione** (proposta da esperto UX, scelta da Luca con "Effettua le prime
sue migliorie"):
- Finché manca un passo obbligatorio del percorso e non ci sono appuntamenti
  oggi e domani, "Completa il profilo" va in
  cima a Oggi, a tutta larghezza, con bordo verde (`SetupJourneyHero` in
  `apps/web/src/components/verification/SetupJourney.tsx`). Dentro: "Ancora N
  passi per ricevere i primi lavori", la stessa barra dei passi delle pagine
  del percorso (`journey-bar`) e il passo da fare in un riquadro verde "Da fare
  adesso" con l'unico pulsante (sul telefono a tutta larghezza). Un passo in
  verifica si mostra in color ottone, senza pulsante.
- Sopra restano solo le richieste da rispondere e le date proposte (§403,
  "la cosa più importante").
- Quando manca solo il passo facoltativo dei pagamenti online resta la riga
  piccola nella colonna di destra (§334).
- Appena iscritto, senza appuntamenti, richieste né messaggi non letti: una
  sola riga "Nessun appuntamento né richiesta per ora: ti avvisiamo appena ne
  arriva una." al posto delle sezioni vuote; "Il tuo andamento" e il consiglio
  sulle recensioni tornano appena c'è qualcosa da mostrare o il percorso è
  finito.

Stesso percorso e stesse regole di sempre (un passo alla volta, §262): cambia
solo dove e come si vede in Oggi.

**Verifica**: sito in locale con un professionista appena registrato,
fotografie prima e dopo da computer (1440 px) e telefono (390 px) in
`analisi/completa-profilo-oggi/` dei file del progetto; typecheck, lint e
test di `apps/web`.

**Eccezione**: con un appuntamento oggi o domani il percorso resta nella
colonna di destra come prima, perché il prossimo lavoro deve vedersi da
telefono senza scorrere (T2, docs/CHANGELOG.md §311; lo controlla
`e2e/tests/agenda-primo-uso.spec.ts`, che la prima versione di questa PR
faceva fallire).
