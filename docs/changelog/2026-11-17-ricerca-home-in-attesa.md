# Giro di prova del 17/11: ricerca in home, battiscopa, guarnizioni, due mestieri in fila

**Richiesta** (Luca, giro di prova cliente su iPhone / professionista su computer):
1. "Quando cerco dalla casella e ci mette tempo non capisco che sta elaborando e
   clicco più volte su Cerca; da cellulare premendo Cerca mi cambiava il testo,
   forse cliccavo sugli esempi Prova perché la pagina si muoveva."
2. "Battiscopa staccato" dava falegname poi muratore (o Tutto Fare): più giusto
   prima muratore.
3. "Sostituzione guarnizione finestra scorrevole" dava solo falegname: può
   farlo anche il Tutto Fare.
4. Con due mestieri proposti, finito l'elenco del primo deve partire subito
   quello del secondo, senza toccare il pulsante in alto.

**Causa del punto 1** (riprodotta con Playwright, iPhone 13): mentre si
scrive, da telefono l'elenco "Trova chi ti serve" sta dentro la pagina e
spinge giù "Cerca". Al primo contatto del dito (`touchstart`) l'elenco si
chiudeva e tutto saliva di ~70 px prima del "click": il tocco finiva nel
vuoto o sugli esempi "Prova" (che cercano subito e cambiano il testo). E
"Cerca" non cambiava mai aspetto: solo la riga in fondo diceva "Sto
pensando…", sotto la tastiera.

**Decisione**:
- `autocompleteModel.ts`: con l'elenco dentro la pagina (sotto gli 800 px)
  si chiude al `click`, non più al primo contatto. Sopra gli 800 px (elenco
  sopra la pagina) resta com'era.
- Dal primo tocco fino all'arrivo nei risultati, dentro "Cerca" la barra che
  si muove dei pulsanti del sito (`ButtonWaitBar`, `searching` e
  `searchingIndicator` di `SearchBar`, `submitting` in `HomeHero`, spento
  dentro la transizione di navigazione). Con l'IA al lavoro (ricerca dal
  problema o con la foto) la barra ha i colori del velo e della barra in cima
  (`.flow-bar--velo`, senza il verde che sul pulsante non si vede), scelta di
  Luca: è l'unico pulsante con la barra colorata, gli altri restano bianchi
  sui verdi e verdi sui bianchi. Una prima versione con "Cerco…" e una
  rotellina non è piaciuta (17/11). La scritta resta sotto, nascosta, così il
  pulsante non cambia misura.
- Durante la ricerca un secondo tocco su "Cerca", sugli esempi o sul modo
  non fa nulla; gli esempi restano al loro posto ma spenti. Al tocco si
  chiude la tastiera, così si vedono "Cerco…" e le luci dell'attesa. Se la
  foto non si può leggere (resta il messaggio), "Cerca" torna toccabile.
- Istruzioni dell'IA (`problem-match.service.ts`, "Casi frequenti"):
  "battiscopa staccato o rotto = muratore, poi falegname (prima falegname
  solo se è di legno)" e "guarnizioni di finestre e porte = falegname, poi
  tuttofare". Dizionario: "battiscopa"/"zoccolino" muratore 2, falegname 1
  (prima solo falegname e Tutto Fare).
- Risultati dal problema: sotto l'ultima pagina del mestiere scelto, la
  sezione "Può farlo anche un falegname" con fino a 10 professionisti
  dell'altro mestiere proposto (senza chi è già sopra o fa anche il primo
  mestiere) e "Vedi tutti" se sono di più. Due elenchi in fila con il loro
  titolo, non mescolati: resta valida la decisione "più mestieri = pulsanti
  in alto, mai elenco misto". Solo senza filtri accesi.

**Verifica**:
- Playwright, iPhone 13 e computer 1280 px, API finta lenta 9 s: prima un
  tocco su un esempio durante l'attesa cambiava il testo in "Scarico
  intasato"; dopo nel pulsante c'è la barra e il testo non cambia (esempi spenti).
- Claude Haiku con le istruzioni nuove: battiscopa staccato → muratore,
  falegname; battiscopa in legno → falegname, muratore; guarnizione finestra
  → falegname, tuttofare; guarnizione del rubinetto → idraulico; lavatrice →
  elettrodomestici. 120 frasi "chiuse" del banco del repo, prima e dopo:
  nessuna frase peggiora per le righe nuove (le differenze sono risposte non
  lette dal mio script veloce, senza formato strutturato). Il banco completo
  (`apps/api/scripts/banco-ia.mjs`) va rifatto dopo il deploy.
- API e database in locale con professionisti finti a Milano: "battiscopa
  staccato" mostra i muratori e sotto "Può farlo anche un falegname".
- `pnpm typecheck` e `pnpm lint` del sito, test di `packages/shared` (204),
  `packages/ui` (19), `apps/api/src/problem-match` (70).
