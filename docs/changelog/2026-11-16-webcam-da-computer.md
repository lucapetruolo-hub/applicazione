# 16/11/2026 — Scattare la foto con la webcam dal computer

**Richiesta di Luca.** "Se clicco sul pulsante della macchina fotografica in
homepage per la ricerca del problema tramite IA, non mi dà la possibilità di
aprire la fotocamera da PC."

**Prima.** Dal computer il pulsante foto (`PhotoPicker.tsx`) apriva subito la
scelta del file (decisione del 15/11 in `2026-11-15-foto-sotto-la-descrizione.md`:
"dal computer una foto del guasto arriva dal telefono"). Il browser da computer
ignora `capture`, quindi la webcam non si poteva usare.

**Decisione.** Cambia solo il computer, il telefono resta com'è.
- Computer **con** una webcam: il pulsante apre una piccola finestra al centro,
  stesso stile del menu del telefono, con "Scatta con la webcam" e "Scegli dal
  computer" (nella richiesta, dalla seconda foto, "Scegli foto o video dal
  computer").
- Computer **senza** webcam: si apre subito la scelta del file, come prima.
  Il browser dice se c'è una webcam senza chiedere il permesso
  (`enumerateDevices`), e si aggiorna se la si collega dopo.
- "Scatta con la webcam" (`WebcamCapture.tsx`): anteprima dal vivo, a specchio
  come nelle videochiamate; riga "Inquadra il problema da vicino, con buona
  luce. Niente persone o documenti."; "Scatta", poi "Va bene questa foto?" con
  "Rifai" e "Usa la foto". La foto salvata non è a specchio (una scritta
  sull'apparecchio si legge dritta). La webcam si spegne appena scattata e
  quando si chiude la finestra.
- Problemi spiegati con una via d'uscita, sempre con "Scegli dal computer":
  - permesso negato: "La webcam è bloccata" + come riattivarla dal lucchetto
    + "Riprova";
  - nessuna webcam trovata: "Non troviamo una webcam";
  - webcam usata da un altro programma: "La webcam non si apre" + "Riprova".
- Vale ovunque c'è `PhotoPicker`: tasto "Foto" della home e spazio foto della
  richiesta di preventivo.

**Difese invariate.** La foto della webcam diventa un file JPEG come uno
scelto dal computer e segue la stessa strada: rimpicciolita nel browser,
Turnstile e limiti di foto della ricerca (`2026-11-13-difese-ricerca-con-foto.md`),
dati nascosti tolti nella richiesta. Il permesso della fotocamera era già
ammesso solo per il nostro sito (`Permissions-Policy: camera=(self)` in
`next.config.mjs`). Nessuna immagine esce dal browser prima di "Usa la foto".

**Verifica.**
- `e2e/tests/webcam-da-computer.spec.ts` (webcam simulata): scatto e foto nella
  richiesta, webcam spenta dopo lo scatto, permesso negato, computer senza
  webcam; dal telefono le prove si saltano (resta il menu Scatta/Galleria).
- Prova a mano in Chromium con webcam finta sulla home (1280×800 e finestra
  700×600): scelta, anteprima, foto scattata, foto nel campo di ricerca,
  permesso negato, telefono invariato. Foto in project-files
  `anteprime/webcam-da-computer/`.
- `pnpm lint` e `pnpm typecheck` di `apps/web` verdi.
