# Palette A "Verde fiducia e terracotta" e carattere Figtree

**Richiesta** (Luca, 11/11/2026, thread "Creare nome, logo e identità del
sito"): colori distintivi per il sito; scelta la palette A "piu tutte e due le
migliorie" (colori delle categorie dalla palette e carattere dei testi da
rivedere), poi il carattere Figtree, poi "Sì, PR ora": colori e carattere sul
sito subito, senza aspettare nome e logo, dopo la home stile Apple (#319).

**Decisione**:
- Fondo color carta `#F7F3EE` al posto del pesca `#FDEFE1`; testo `#1B1A18`,
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
distintiva; carta, verde e terracotta sono più puliti e ordinati (la
sensazione chiesta da Luca) e lasciano al verde il ruolo di azione. Figtree è
più caldo e tondo di Instrument Sans e si legge bene anche piccolo.

**Verifica**: contrasti WCAG AA sul fondo carta: testo 15,7:1, grigio 6,2:1,
terracotta 5,6:1 (5,0:1 sul suo velo), verde "fatto" 6,3:1 su bianco, rosso
5,9:1, bordo dei campi 3,25:1 (3,6:1 su bianco), colori delle categorie tra 5
e 7,4:1 sul loro fondo. `pnpm lint`, `typecheck` e `test` di web, ui e api
verdi. Foto prima/dopo di home, ricerca e profilo su computer e telefono nel
thread.
