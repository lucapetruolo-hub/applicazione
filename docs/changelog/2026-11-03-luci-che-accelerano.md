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
