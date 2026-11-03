# Luci sfumate che accelerano

**Richiesta** (Luca, 03/11/2026): da un video con due macchie di colore
sfocate che si muovono piano e accelerano quando si preme "Send", dove usare
l'effetto sul sito. Le luci sfumate (`GlowLights`, §305-§306) c'erano già; il
nuovo è l'accelerazione. Luca ha scelto i punti 1, 2 e 4 della proposta, con
le note tecniche e le migliorie.

**Decisione**
- `GlowLights` regola la velocità delle sue animazioni CSS con
  `updatePlaybackRate` e una curva morbida, mai cambiando
  `animation-duration` (come nel video), che fa saltare le luci di colpo.
  L'effetto vale solo dentro il riquadro delle luci, non su tutta la pagina
  (niente `body:has(button:active)`).
- Punto 1: nel riquadro scuro "Meno telefonate inutili" della home e
  nell'apertura di /per-professionisti, toccare "Iscriviti gratis" (il link
  con `data-glow-boost`, prop `pressBoost`) fa correre le luci per un attimo,
  poi tornano piano in circa 2 secondi. Funziona anche con Invio da tastiera.
- Punto 2: nella hero della home, mentre il sito cerca chi serve per il
  problema scritto (dizionario e, nei dubbi, intelligenza artificiale, fino a
  3 secondi), compaiono le luci, veloci (prop `speed`), e la riga sotto le
  ricerche diventa "Cerco chi ti serve…" (`role="status"`, la legge il
  lettore di schermo). Solo per la ricerca per problema; a riposo la hero
  resta verde opaca senza luci (scelta del 28/10).
- Punto 4: "Richiesta inviata" ha dietro la foto le luci tenui del fondo
  pesca, che partono veloci e rallentano (prop `burst`), sfumate ai lati
  (`glow-lights--sfumato`). Va contro la scelta "niente festeggiamenti" del
  §341, ma è Luca stesso a sceglierla: resta un movimento discreto, niente
  coriandoli né emoji.
- Migliorie: fuori dallo schermo le luci sono ferme (IntersectionObserver),
  sul telefono sono più piccole e meno sfocate (40 px invece di 60). Con
  "riduci movimento" restano ferme come prima.

**Verifica**: typecheck, lint e build di `apps/web`; con Playwright la
velocità delle animazioni misurata: 1 a riposo, 5 col dito su "Iscriviti
gratis", di nuovo 1 dopo 2,6 secondi; 3 durante l'attesa della ricerca per
problema; in "Richiesta inviata" da 5 a 1 in circa 2 secondi; ferme ("paused")
col riquadro fuori dallo schermo. Foto da telefono (390 px) e computer
(1440 px) in `analisi/luci-che-accelerano/` dei file del progetto.

## Tessera "Non trovi il tuo lavoro?" ed esempi nel campo (03/11)

**Richiesta** (Luca): la tessera in fondo alle categorie non si capiva; e
toccando "Cosa è successo?" uscivano solo i mestieri: servono anche frasi
d'esempio, per far capire che si può scrivere il problema.

**Decisione**
- La tessera diceva "Descrivilo, ci pensiamo noi" ma apriva /preventivo, che
  chiedeva per prima cosa la categoria non trovata. Ora (proposta A, scelta
  di Luca) porta al campo "Cosa è successo?" in cima alla home con il cursore
  dentro: "Non trovi il tuo lavoro? Scrivi il problema, ti diciamo chi
  chiamare", icona matita. Senza il campo (modalità Online) o senza
  JavaScript resta il link a /preventivo.
- A campo vuoto l'elenco mostra prima "Scrivi il problema, per esempio:" con
  due frasi diverse da quelle sotto il riquadro (Il rubinetto perde,
  Caldaia in blocco; due e non quattro, scelta di Luca, perché si vedano
  anche le categorie), ognuna con
  "Ti serve: …", poi "Oppure scegli chi cerchi:" con i mestieri. Tutte
  riconosciute con sicurezza dal dizionario (`matchProblem`). Toccandone una
  va nel campo e "Cerca" porta ai risultati per problema. Nuove props
  facoltative `queryField.examples` di `SearchBar` ed `emptyHeadings` di
  `Autocomplete`: la barra delle altre pagine non cambia.

**Verifica**: typecheck di `packages/ui` e `apps/web`, lint, build; con
Playwright da telefono e computer: tocco sulla tessera → campo in vista con
il cursore e le frasi aperte; tocco su "Caldaia in blocco" → testo nel campo.

## Frasi d'esempio che seguono le ricerche (03/11)

**Richiesta** (Luca): frasi d'esempio che cambiano, ma sempre le più cercate
e utili; 5 sotto il riquadro (si scorrono da telefono); tutte le migliorie
proposte (anche i mestieri più cercati e l'elenco modificabile in Admin).

**Decisione**
- Elenco di frasi (`DEFAULT_PROBLEM_EXAMPLES` in
  `packages/shared/src/problemExamples.ts`, 14 frasi, almeno una per i
  mestieri del lancio), tutte riconosciute con sicurezza dal dizionario (una
  prova automatica lo controlla). Mai frasi scritte dai clienti: possono
  contenere dati personali.
- Ordine: prima una frase per mestiere, dal mestiere più cercato, poi le
  altre. "Più cercato" è lo stesso conteggio che ordina le categorie della
  richiesta di preventivo (`CategoriesService.getPopularity`: ricerche e
  richieste dell'ultimo anno, una richiesta vale 3 ricerche); i mestieri mai
  cercati seguono i volumi di Google (Keyword Planner, §303). Rotta pubblica
  `GET /problem-match/examples`, ricalcolata al massimo ogni 10 minuti, letta
  dal server della home (niente salti dopo il caricamento).
- In home: sotto il riquadro le prime 5 frasi ("Prova:") e i 3 mestieri più
  cercati ("O scrivi solo chi cerchi:", al posto di Idraulico, Elettricista,
  Babysitter fissi); nel campo vuoto 2 frasi a caso tra le 4 successive, mai
  un doppione di quelle sotto.
- Admin → Mestieri richiesti → "Frasi d'esempio in home": elenco con
  mestiere riconosciuto e dove compare (sotto la ricerca, nel campo, in
  riserva), "Aggiungi" e "Togli" (MODERATION, nel registro azioni). Una frase
  che il dizionario non riconosce con sicurezza viene rifiutata; servono
  almeno 5 frasi. Tabella `problem_examples` (migrazione
  `20261103170000_frasi_esempio_problema`): vuota vale l'elenco di partenza,
  la prima modifica lo copia lì.

**Verifica**: prove di `packages/shared` (36 passate, con le 3 nuove),
typecheck di API e sito, lint, build; foto da telefono e computer. Test e2e
`barra-preventivo.spec.ts`: tocca la prima frase, qualunque sia, invece di
"Salta la corrente".

## Frasi d'esempio su una riga che scorre piano

**Richiesta (Luca, 03/11/2026)**: con 5 frasi su computer andavano a capo
su due righe. "Un elenco che si muove da solo in maniera lenta con delle
freccette piccole nei lati, in entrambi gli elenchi", "che si fermano col
puntatore sopra".

**Decisione** (`ExampleRow` in `HomeHero.tsx`, `.hero-examples-*` in
`globals.css`)
- Ogni elenco ("Prova:" e "O scrivi solo chi cerchi:") sta su una riga che
  scorre col dito, la rotella o le frecce.
- Freccette piccole ai lati solo quando c'è altro da vedere da quella parte;
  fuori dal Tab (le frasi sono già raggiungibili), con nome per i lettori di
  schermo.
- Scorrimento da solo molto lento (14 px al secondo), dopo 2,5 secondi, da un
  capo all'altro e ritorno con una pausa di 2,5 secondi a ogni capo. Si ferma
  col puntatore sopra e riparte quando esce; si ferma del tutto al primo
  tocco, clic, rotella, tasto o Tab dentro la riga (chi la usa decide lui);
  fermo fuori dallo schermo e con "riduci movimento".

**Verifica**: lint, typecheck, build; Playwright su telefono (390) e computer
(1440): una riga sola, la riga si sposta da sola, sotto il puntatore resta
ferma, dopo un tocco non riparte.
