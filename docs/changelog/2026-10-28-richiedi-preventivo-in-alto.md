# "Richiedi preventivo" in alto di nuovo in home

**Richiesta** (Luca, 28/10/2026): "prima c'era un pulsante in alto a destra
con richiedi preventivo che nella home non vedo più": rimetterlo per i
clienti e per chi non ha fatto l'accesso, e toglierlo nel profilo di un
professionista, dove c'è già la barra "Richiedi un preventivo".

**Perché era sparito**: tolto di proposito solo dalla home nella revisione
del design del 25/10 (docs/CHANGELOG.md §349, PR #143), perché sotto la
ricerca della home c'è il link "Preferisci descrivere il lavoro? Richiedi
un preventivo". Da telefono però quel link si vede solo scorrendo, quindi
aprendo la home non c'era nessun invito alla richiesta. Le altre pagine lo hanno
sempre avuto. Nel profilo con la barra era già nascosto dal §385 (PR #161).

**Decisione**:
- Home: il pulsante torna in alto a destra (`SiteHeader.tsx`), visibile appena si
  apre la pagina e anche scorrendo. Come prima: mai per un professionista, mai su
  accesso e registrazione.
- Profilo di un professionista che accetta richieste: resta nascosto
  (`body:has(.profile-cta-bar)` in `globals.css`); nei profili in pausa resta,
  perché è l'unico modo di chiedere ad altri.
- Nuovo: non compare su `/preventivo`, dove porterebbe alla pagina già aperta.

**Verifica**: prova nel browser in `e2e/tests/barra-preventivo.spec.ts`
(visibile in home da telefono e da computer, il clic apre `/preventivo`, lì
non c'è); foto della home e del profilo da telefono e computer.

## Link sotto la ricerca in home

**Richiesta** (Luca, 28/10/2026): "quei due link non sono belli esteticamente, valutali da esperto". Analisi e 4
proposte con le foto in `analisi/link-sotto-ricerca-home.md` (Libreria) e `anteprime/link-sotto-ricerca/`.

**Decisione** (proposta 4, consigliata):
- Il campo di ricerca si chiama "Cosa ti serve?" con l'esempio "Es. idraulico, un guasto" (`SearchBar`, anche nella
  barra compatta): il campo capiva già il problema (§392) ma non lo diceva. L'esempio sta intero anche a 320 px.
- Tolti i due link sottolineati sotto il riquadro (`hero-secondary-link`): "Richiedi un preventivo" era un doppione del
  pulsante in alto, il rosso sottolineato sembrava un errore e da telefono non si vedevano.
- Dentro il riquadro verde: "Un guasto da sistemare oggi?" e la pillola "Richiesta urgente" (`hero-urgent-link`),
  chiara sul verde, fulmine bianco in un cerchio rosso, 48 px, larga tutto lo schermo da telefono.
- Telefoni sotto i 360 px (iPhone SE): il pulsante in alto per chi non ha fatto l'accesso diventa "Preventivo",
  perché l'etichetta intera usciva dallo schermo.

**Verifica**: typecheck e lint di web; `barra-preventivo`, `quanto-costa` e `richiesta-urgente` verdi da telefono e
computer (27 prove); foto a 412, 320 e 1440 px in `anteprime/link-sotto-ricerca/fatto/`.

## Riquadro verde in cima alla home meno "metallico"

**Richiesta** (Luca, 28/10/2026): "la hero mi sa di metallico, come si potrebbe risolvere da esperto del settore?".
Analisi, sette proposte e le foto in `analisi/hero-meno-metallico.md` e `anteprime/hero-meno-metallico/`; le
tecniche dei reel valutate nello stesso thread.

**Decisione** (scelta C di Luca, "Niente, solo verde"): il verde della proposta 7, senza foto (servirebbe una foto
neutra per troppi mestieri diversi), testo e ricerca al centro come prima.
- Nuovo tono `verde-opaco` di `GlowLights`, solo per la hero: sfumatura leggera dall'alto in basso (`#1c9d61` →
  `#14824f`) e grana al 5% in `soft-light` contro le bande del gradiente. Niente luci (riflesso menta, azzurro e
  ottone erano la causa del metallico), quindi anche niente animazione. Il tono `verde` resta per le altre parti
  (`CategoryStoryRail`).
- Ombre a strati, senza riflesso chiaro in alto, su "Cerca" della hero, "Richiedi preventivo" in alto e la pillola
  "Richiesta urgente": il pulsante resta verde e tondo ma si stacca dal fondo.
- Il testo bianco si legge meglio di prima: il verde più chiaro del vecchio riquadro (`#1fae70`) era sotto il
  verde più chiaro di adesso.
- Corretto di passaggio: la regola dei 15 px per l'etichetta in alto sui telefoni stretti puntava a una classe che
  Tamagui non mette sul pulsante (`.site-header-cta`); ora usa il link (`.site-header-cta-link`).

**Verifica**: typecheck e lint di web; prove nel browser come sopra; foto a 390, 320 e 1440 px in
`anteprime/hero-meno-metallico/fatto/`, nessuno scorrimento orizzontale.
