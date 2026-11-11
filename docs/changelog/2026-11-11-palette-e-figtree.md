# Palette A "Verde fiducia e terracotta" e carattere Figtree

**Richiesta** (Luca, 11/11/2026, thread "Creare nome, logo e identità del
sito"): colori distintivi per il sito; scelta la palette A "piu tutte e due le
migliorie" (colori delle categorie dalla palette e carattere dei testi da
rivedere), poi il carattere Figtree, poi "Sì, PR ora": colori e carattere sul
sito subito, senza aspettare nome e logo, dopo la home stile Apple (#319).

**Decisione**:
- Fondo crema `#FAF2E8` al posto del pesca `#FDEFE1` (Luca ha provato la carta `#F7F3EE` della palette A e l'ha voluta "leggermente più calda come prima": scelta la crema, via di mezzo, tra tre fondi a confronto); testo `#1B1A18`,
  grigio dei testi secondari `#5E5A54`, filetto `#E7E0D7`, bordo dei campi
  `#8E867C`. Stessi nomi di chiave in `packages/ui/src/tokens.ts`
  (`gesso`, `grafite`, `grafite70`, `filetto`, `bordoCampo`): i ~50 file che li
  usano si aggiornano da soli. I colori scritti a mano nei CSS (anche quelli
  nuovi della home) portati agli stessi toni neutri, con la stessa tabella.
- Verde dei pulsanti e dei link invariato (`#128552`, `#0E7A4C`, `#189A63`).
- `brand.verificato` resta il verde di "fatto" (salvato, pagato, lavoro
  concluso, pulsanti di conferma), ora `#0E6B42`. Il bollino "Verificato" e
  "Lavoro fatto tramite il sito" passano alla terracotta (`brand.terracotta`
  `#A3441F` su `brand.terracottaVelo` `#F6E3D9`), solo per i segni di fiducia:
  dare la terracotta a tutto `verificato` avrebbe colorato di terracotta anche
  i messaggi di conferma.
- Luci sfumate del fondo (`.site-blobs`): terracotta leggera in alto a
  destra e verde in basso a sinistra (prima verde in alto e ottone in basso,
  colori invertiti su richiesta di Luca); anche la luce chiara di "Richiesta
  inviata" passa dall'ottone alla terracotta.
- Verde del marchio **cipresso pastello `#40776A`** (scelta di Luca tra cinque
  verdi e poi tra tre cipressi più chiari, analisi in
  `analisi/identita/colori/palette.md` della cartella del progetto): i verdi
  accesi di prima (#128552 e famiglia, tinta 154°) erano quelli di Spotify,
  WhatsApp e Fineco. Tutte le tinte verdi del sito spostate sulla stessa
  famiglia (165°, meno sature): pieno `#40776A` (bianco 5,2:1), link
  `#386C5F` (5,4:1 sul crema), velo `#E1EEEB`, "fatto" `#325F54`.
- Titoli h1-h3 in verde inchiostro `brand.inchiostro` `#0F3B2C` (11,3:1).
- Pulsanti piatti come su apple.com: tolti l'ombra colorata sotto e l'alone
  che segue il cursore (il magnete resta). Al passaggio del mouse su menu,
  orari e pulsanti dei risultati il filo verde che correva lungo il bordo
  (04/11) diventa una velatura leggera in 150 ms. Pulsanti di acquisto neri
  con il cerchio rosso: restano (Luca, 11/11).
- Rosso `#B42318` (prima `#C8362B`) con velo `#FDE8E6`, anche nelle email.
- Colori delle categorie (`CATEGORY_ACCENT` in
  `apps/web/src/components/icons/CategoryIcons.tsx`) dalla palette, uno per
  mestiere; elettrodomestici e tende da sole restano com'erano.
- Carattere Figtree (font variabile 400-700, sottoinsieme latino di Google
  Fonts, licenza OFL) al posto di Instrument Sans per titoli e testo del sito,
  file nel repo (`apps/web/src/app/fonts/figtree-latin.woff2`). L'app mobile,
  ferma, resta con Instrument Sans: si cambia quando si riprende.
- Nome e logo restano provvisori ("Professionisti").

**Motivo**: il pesca con il verde dava un'aria da "vicinato" ma poco
distintiva; crema, verde e terracotta sono più puliti e ordinati (la
sensazione chiesta da Luca) e lasciano al verde il ruolo di azione. Figtree è
più caldo e tondo di Instrument Sans e si legge bene anche piccolo.

**Verifica**: contrasti WCAG AA sul fondo crema: testo 15,7:1, grigio 6,2:1,
terracotta 5,6:1 (5,0:1 sul suo velo), verde "fatto" 5,9:1 (6,3:1 su bianco),
link verdi 4,85:1, rosso 5,9:1, bordo dei campi 3,24:1 (3,6:1 su bianco), colori delle categorie tra 5
e 7,4:1 sul loro fondo. `pnpm lint`, `typecheck` e `test` di web, ui e api
verdi. Foto prima/dopo di home, ricerca e profilo su computer e telefono nel
thread.
