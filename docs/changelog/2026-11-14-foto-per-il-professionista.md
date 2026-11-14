# 14/11/2026 — Foto per il professionista in uno spazio loro, senza posizione GPS

**Richiesta di Luca.** Dividere la foto per l'intelligenza artificiale da quelle
per il professionista. Nella richiesta di preventivo lo spazio per le foto torna
sotto, con la foto della ricerca già nell'elenco. In home la scritta nomina
anche la foto.

**Decisione di Luca.** Niente controllo dell'IA sulle foto che il cliente
aggiunge per il professionista: sono responsabilità del cliente e un controllo
costerebbe a ogni richiesta. Analisi completa in
`analisi/foto-ia-e-professionista-versione-profonda.md` (cartella del progetto).

## Cosa cambia

- **Richiesta di preventivo** (`GuidedRequestForm.tsx`):
  - via il tasto "Foto" dentro "Descrivi il lavoro" (era stato messo il
    13/11, `2026-11-13-foto-nel-campo-di-ricerca.md`);
  - torna dopo "Quando ti serve?" lo spazio "Foto per il professionista
    (facoltative)", con le miniature e una casella "Aggiungi" con la
    fotocamera sfumata;
  - la riga sotto avvisa il cliente: "Le vede il professionista: niente numeri
    di telefono, documenti o persone";
  - la foto della ricerca entra già in quell'elenco, come prima.
- **Posizione GPS tolta** (`withoutHiddenData` in `apps/web/src/lib/photoSearch.ts`):
  - ogni foto aggiunta per il professionista si ridisegna nel browser, come la
    foto della ricerca, e perde posizione GPS e modello del telefono;
  - il motivo è che la posizione di una foto scattata in casa è l'indirizzo del
    cliente, che il professionista non deve vedere prima dell'accettazione
    (CLAUDE.md §5 punto 9);
  - se il browser non riesce ad aprirla (HEIC su Chrome per computer), parte
    com'è;
  - per i video resta la ricodifica di Cloudinary.
- **L'IA guarda la prima foto solo quando serve** (scelta di Luca):
  - se l'IA, dal testo, non capisce il mestiere e il cliente ha aggiunto una
    foto, la prima foto va a `POST /problem-match/photo` (copia piccola, senza
    GPS, Turnstile invisibile);
  - poi `POST /problem-match` con `photo` sceglie la categoria;
  - sotto le foto compare "Dalla foto ti suggeriamo Idraulico: l'abbiamo
    scelta sopra, puoi cambiarla.";
  - è una sola chiamata per testo e foto, mai con i video, e mai se il cliente
    ha già scelto la categoria a mano;
  - con l'IA spenta o in errore la categoria si sceglie a mano, come prima;
  - la frase "Non abbiamo capito chi ti serve" aggiunge "oppure aggiungi una
    foto qui sotto".
- **Corretto un difetto**: un video caricato da chi aveva già fatto l'accesso
  veniva segnato come foto (`isVideo: false` fisso), e nella miniatura non
  partiva come video.
- **Home** (`HomeHero.tsx`): "Con parole tue o con una foto: l'intelligenza
  artificiale capisce chi ti serve.", solo con la ricerca con foto accesa;
  altrimenti resta "Con parole tue".

## Verifica

- `pnpm typecheck` e `pnpm lint` di `apps/web`.
- Prova in Chromium: una foto JPEG con coordinate GPS passata da
  `withoutHiddenData` esce senza EXIF.
- Prova in Chromium con le risposte dell'API simulate: testo non capito,
  foto, poi "Dalla foto ti suggeriamo Idraulico" (chiamate: testo, foto, testo
  con foto).
- Foto prima/dopo su telefono e computer (home, richiesta con la foto della
  ricerca).
- Da fare a mano una volta, con Cloudinary vero: scaricare un video
  dell'iPhone caricato in una richiesta e controllare con exiftool che non
  abbia la posizione.
