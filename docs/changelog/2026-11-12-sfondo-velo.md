# Sfondo a velo e passi numerati (spunto dalla console di Meta)

**Richiesta** (Luca, 12/11/2026, thread "Prendere spunto dallo sfondo di
Meta"): gli piace lo sfondo della console Meta for Developers, sfumato su tutta
la pagina. Tra le anteprime ha scelto la "F2" (luce di Meta, colori nostri, su
tutta la pagina) nella versione "mista" (velo pieno in alto, leggero in
basso), i passi numerati con la spunta e un verde di marca nuovo con una punta
di azzurro: "verde-azzurro" #1E6B6E, al posto del cipresso #40776A.

**Decisione**:
- `.site-blobs` (in `apps/web/src/app/layout.tsx`) non ha più due macchie
  sfocate ma un velo di sfumature radiali fisso dietro a tutto il sito: in alto
  menta a sinistra, lilla al centro e pesca a destra; in basso menta a sinistra
  e pesca a destra, più un lilla appena visibile al centro. Fondo crema
  `#faf2e8` invariato (palette A). Tolte le classi `.auth-page-blob*` e
  `.auth-page-blobs`, non più usate.
- I passi di registrazione e "Password dimenticata" (`AuthStepHeader`) non sono
  più una barra a segmenti ma cerchi numerati uniti da una linea: spunta verde
  sui passi fatti, anello verde col numero sul passo di adesso, grigio sui
  prossimi. "Passo N di M" scritto resta (la fila è decorativa,
  `aria-hidden`). Nell'area del professionista ("Completa il profilo",
  `SetupJourney`) i passi con spunta c'erano già.
- Versione finale (stesso giorno), Luca manda lo screenshot della console Meta
  e chiede "rendila più simile a questo sfondo": colori presi punto per punto
  dallo screenshot (rosa #f8f0f1 in alto a sinistra, azzurro #e6f0f7 a destra,
  lilla al centro, menta #ecf8f0 in basso a destra, azzurro in basso a
  sinistra), opachi sopra il crema: il fondo del sito diventa freddo e chiaro
  come quello di Meta. Va contro il "fondo crema" della palette A, su richiesta
  esplicita di Luca. Il crema resta nei riquadri che lo usano. Poi Luca:
  "la parte in alto e sinistra più crema": il rosa in alto a sinistra diventa
  crema caldo, più largo. Infine "tutti i colori leggermente più caldi":
  azzurri, lilla e menta spostati verso il caldo (meno blu, un filo di rosso).
- Giro precedente, Luca: "mi piace con più colori su tutta la pagina come
  Meta": colori pieni anche ai lati e in basso, con "più sfumature di rosa, viola":
  viola in alto al centro e a destra a metà, rosa a sinistra a metà e in basso
  al centro, menta 0,38 e pesca 0,34 in basso.
- Prima versione, velo misto: in alto menta 0,41, lilla 0,36, pesca 0,38 ("un pelo più colorato", Luca); in basso menta 0,17,
  pesca 0,14, lilla 0,12.
- Verde di marca: `cianografiaPieno` #40776A → #1E6B6E (pulsanti, link, spunte,
  logo provvisorio, icone, email, mappa). Tutta la famiglia del verde segue
  (tinta +16°, più satura; i toni scuri più scuri, i veli chiari con la stessa
  luce): `cianografia` #4C8A7A → #247C7C, `cianografiaScuro` #386C5F →
  #186163, `cianografiaVelo` #E1EEEB → #DFF0F0. Restano uguali il verde di
  "fatto"/"Verificato" `verificato` #325F54 (così una conferma resta verde e
  distinta dal pulsante d'azione) e il verde inchiostro dei titoli #0F3B2C.
  Il colore nel Branding di Stripe lo cambia Luca a mano (#1E6B6E).
- Alternative mostrate e non scelte (cartella del progetto,
  `anteprime/sfondo-meta/`): pino, acqua profondo, smeraldo, bosco, petrolio,
  blu ardesia, indaco, terracotta, oliva; blu di Meta sconsigliato.

**Perché**: il velo largo dà la freschezza di Meta senza cambiare i colori del
marchio; il blu di Meta è stato sconsigliato (va contro la palette A e farebbe
sembrare il sito "da software").

**Verifica**: bianco sul nuovo verde 6,2:1 (prima 5,2:1), link #186163 e
#247C7C più scuri di prima; contrasto del grigio dei testi `#5e5a54` sul punto più carico del
velo sopra 5:1 (calcolato), prove axe della CI; foto prima/dopo da telefono e
computer in `anteprime/sfondo-meta/sito/`.
