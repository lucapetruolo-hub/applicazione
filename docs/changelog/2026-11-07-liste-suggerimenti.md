# Liste dei suggerimenti: si vede che continuano

**Richiesta** (Luca, 07/11/2026): in home, sotto "Cosa è successo?" e
"Città", chi non usa la rotellina come capisce che la lista continua più in
basso, e come ci arriva?

**Com'era** (provato sul sito vero): "Cosa è successo?" ha 17 voci e se ne
vedevano 4, "Città" 7 e se ne vedevano 5. Su Mac la barra di scorrimento è
nascosta e l'ultima riga si tagliava giusta sul bordo: la lista sembrava
finita. Con le frecce la voce scelta scendeva ma la lista restava ferma (alla
nona freccia era scelta "Fabbro", fuori vista). Su computer la lista usciva
dal fondo della finestra; su telefono il campo stava in fondo allo schermo e,
con la tastiera aperta, della lista non si vedeva nulla.

**Decisione** (Luca sceglie i punti 1-5 della proposta): tutto nel
componente unico `Autocomplete`, quindi vale per ogni lista uguale del sito
(home, barra di ricerca in alto, /cerca, richiesta guidata, profilo,
account, admin). La parte del sito sta in
`packages/ui/src/AutocompleteList.web.tsx`, l'app tiene la lista di prima
(`AutocompleteList.tsx`).

1. Con le frecce la voce evidenziata resta sempre in vista; si sposta solo
   la lista, mai la pagina.
2. Telefono (`pointer: coarse` e meno di 768 px): toccando il campo la
   pagina sale e il campo, con la sua etichetta, si mette sotto la barra in
   alto. Non succede se il campo è già in una barra o finestra ferma.
3. In fondo alla lista una sfumatura bianca con "Altre N" (pulsante a
   pillola verde): ogni clic o tocco porta in cima la prima voce coperta,
   intera; sparisce quando si arriva in fondo. Il clic non toglie il fuoco
   al campo. Nascosto al lettore di schermo, che scorre con le frecce.
4. Barra di scorrimento sottile verde sempre visibile, anche su Mac
   (`.autocomplete-scroll` in `apps/web/src/app/globals.css`: regole
   `-webkit-` per Chrome, Edge e Safari, `scrollbar-width` per Firefox).
5. Lista alta quanto lo spazio libero nella finestra (tra 150 e 320 px,
   segue la tastiera del telefono con `visualViewport`), accorciata fino a
   metà dell'ultima voce che ci sta: una voce tagliata a metà dice che c'è
   altro.

Scartati da Luca per ora: lista più corta in "Cosa è successo?" (6), tasti
Pag giù / Inizio / Fine (7).

**Verifica**: Playwright sul sito in locale, computer 1366×800 e iPhone 13.
Computer: lista 225 px con "Altre 15"; nove frecce → "Fabbro" in vista
(prima fuori); in fondo e di nuovo in cima sempre in vista; "Altre" lascia
il fuoco nel campo e porta "Oppure scegli chi cerchi:" in cima; barra larga
10 px visibile (con le barre del browser accese). Telefono: dopo il tocco il
campo sale sotto la barra in alto (lista da 579 px a 164 px dal bordo) con 3
voci e "Altre 14" visibili; il tocco su "Altre" lascia la tastiera aperta.
`pnpm lint`, `typecheck` di web e ui, test di ui.
