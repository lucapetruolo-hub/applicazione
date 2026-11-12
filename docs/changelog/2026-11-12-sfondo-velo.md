# Sfondo a velo e passi numerati (spunto dalla console di Meta)

**Richiesta** (Luca, 12/11/2026, thread "Prendere spunto dallo sfondo di
Meta"): gli piace lo sfondo della console Meta for Developers, sfumato su tutta
la pagina. Tra le anteprime ha scelto la "F2" (luce di Meta, colori nostri, su
tutta la pagina) con i colori "leggermente meno marcati", più i passi numerati
con la spunta.

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
- Verde di marca invariato: le alternative (pino, verde acqua profondo,
  smeraldo, bosco) sono in `anteprime/sfondo-meta/verdi-confronto.png` della
  cartella del progetto, in attesa della scelta di Luca.

**Perché**: il velo largo dà la freschezza di Meta senza cambiare i colori del
marchio; il blu di Meta è stato sconsigliato (va contro la palette A e farebbe
sembrare il sito "da software").

**Verifica**: contrasto del grigio dei testi `#5e5a54` sul punto più carico del
velo sopra 5:1 (calcolato), prove axe della CI; foto prima/dopo da telefono e
computer in `anteprime/sfondo-meta/sito/`.
