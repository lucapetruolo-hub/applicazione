# Ricerca per problema in primo piano nella home

**Richiesta** (Luca, 03/11/2026): chi arriva in home non capisce che può
descrivere brevemente il problema per cercare, una funzione molto innovativa:
come valorizzarla? Dopo la proposta con le prove visive ha scelto la "B" e ha
chiesto: esempi presi tra i più cercati su Google, far capire che si può
scrivere anche solo il mestiere (idraulico, elettricista, babysitter) e usare
le parole "Novità" e "intelligenza artificiale".

**Decisione**
- Titolo: "Scrivi il problema. Ti diciamo chi chiamare." (prima "Trova un
  professionista vicino a te"). Sottotitolo: "Con parole tue: l'intelligenza
  artificiale capisce chi ti serve. Idraulici, elettricisti e altri
  professionisti vicino a te." (le parole per Google restano qui).
- Campo con "A domicilio": "Cosa è successo?" con la pillola "Novità" e
  l'esempio "Es. scarico intasato". Con "Online" resta "Cosa ti serve?".
  Nuove props facoltative di `SearchBar` (`queryField`, `footer`) e
  `labelBadge` di `Autocomplete`: la barra in alto delle altre pagine non
  cambia.
- Esempi da toccare sotto il riquadro: "Prova: Scarico intasato · Salta la
  corrente · Pulizie dopo i lavori" (tra i suggerimenti di Google in
  `analisi/seo-dati/suggerimenti-google.json`: "scarico intasato", "salta la
  corrente", "pulizie post ristrutturazione") e "O scrivi solo chi cerchi:
  Idraulico · Elettricista · Babysitter". Un tocco scrive il testo nel campo e
  ci mette il cursore: compare subito "Ti serve: …". Tutti e sei riconosciuti
  con sicurezza dal dizionario (`matchProblem`). Da telefono una riga che
  scorre per gruppo, con una sfumatura a destra.
- "Intelligenza artificiale" è vero: il 03/11 l'API di produzione risponde
  `source: "ia"` sui casi dubbi ("esce acqua sotto il lavandino").

**Verifica**: typecheck e lint di `apps/web`, build di produzione, foto da
telefono (320 e 390 px) e computer (1440 px) prima e dopo il tocco di un
esempio, test e2e `barra-preventivo.spec.ts` aggiornato (etichetta, esempio,
tocco su "Salta la corrente" → "Ti serve: Elettricista").

## Luce sul bordo (03/11, idea di Luca da un video)

Pillola "Novità" e campo "Cosa è successo?" in home con una luce che gira sul
bordo (`conic-gradient` con `@property --badge-angle`), nei verdi del sito e
un filo d'oro, non arcobaleno. Prima provata sul riquadro bianco intero; Luca
l'ha voluta sul campo, che indica proprio dove scrivere. Due giri da 3
secondi all'apertura della pagina, poi ferma (miglioria scelta da Luca: un
movimento continuo stanca); col cursore nel campo il bordo diventa verde
pieno. Ferma da subito con "riduci movimento"; senza `@property` il bordo
resta sfumato fermo. Classi `.label-badge` e `.hero-problem-input` in
`globals.css`, `queryField.className` di `SearchBar` e `inputClassName` di
`Autocomplete`. axe senza problemi di contrasto (telefono e computer).
