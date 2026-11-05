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

**Con un appuntamento oggi o domani** il riquadro non va in cima, perché il
prossimo lavoro deve vedersi da telefono senza scorrere (T2,
docs/CHANGELOG.md §311, controllato da `e2e/tests/agenda-primo-uso.spec.ts`):
va subito sotto "Oggi e domani", con lo stesso aspetto (scelta di Luca del
05/11 dopo le foto in `analisi/completa-profilo-oggi/con-appuntamento-*`).
Sul computer sta nella colonna di sinistra, così "Aumenta la tua visibilità"
resta in alto a destra.

## Animazione della barra (05/11, scelta di Luca)

Quando dall'ultima visita a Oggi un passo è stato fatto, nella barra del
riquadro il suo cerchio fa un piccolo salto e lancia un alone verde, e il
tratto che segue si riempie da sinistra. Succede una volta sola: i passi
fatti si ricordano nel browser (`percorso-fatti:<id>`, solo comodità, senza
memoria nessuna animazione). Nella barra, anche nelle pagine del percorso,
il tratto dopo un passo fatto ora è verde come nel percorso verticale. Con
"riduci movimento" la regola globale lo rende istantaneo.
Verifica: fotogrammi in `analisi/completa-profilo-oggi/animazione-barra-telefono.png`.

## Prova con 4 passi (05/11, chiesta da Luca)

In locale Stripe e Didit non sono accesi, quindi le risposte dell'API su
abbonamento e verifiche sono state simulate: piano da attivare, dati fiscali,
identità, identità in verifica, da telefono (390 px) e computer (1440 px).
Difetto trovato: da telefono, con 4 passi, i nomi si accavallavano ("Pian",
"Dati fisc", "Identi"). Ora, con 4 passi in un riquadro stretto, si vede solo
il nome del passo da fare; gli altri nomi restano per i lettori di schermo.
Foto in `analisi/completa-profilo-oggi/quattro-passi-*.png`.
