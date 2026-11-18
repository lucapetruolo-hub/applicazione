# Richiesta di preventivo: il video non si perde più se si invia mentre carica

**Richiesta** (Luca, giro di prova del 18/11/2026, cliente su iPhone e
professionista su computer): allegando un video alla richiesta (anche a 2-3
professionisti insieme) e inviando prima della fine del caricamento, il video
non arrivava al professionista.

**Causa** (`GuidedRequestForm.tsx`, prima di questa modifica):
- `addPhoto` aspettava `frameFromVideo` (il fotogramma per l'IA, fino a 8
  secondi su iPhone) **prima** di accendere lo stato di caricamento: in quei
  secondi non c'era nessun segno e "Invia" era libero, la richiesta partiva e il
  video si caricava dopo, agganciato a niente;
- un solo `isUploadingPhoto` per tutti i file: con più file insieme (QR "Scatta
  dal telefono") il primo che finiva liberava "Invia" mentre gli altri si
  caricavano ancora;
- un caricamento non riuscito (es. video oltre i 50 MB, rete che cade) mostrava
  l'errore al passo 1 mentre il cliente era al passo 3: "Invia" tornava attivo e
  la richiesta partiva senza video.

**Decisione**:
- Nuovo `apps/web/src/lib/useRequestMedia.ts`: ogni foto o video ha il suo
  riquadro con lo stato (in attesa, in caricamento con percentuale, caricato,
  non caricato). Il riquadro compare subito e il caricamento parte subito; il
  fotogramma per l'IA si prepara a parte e non lo ritarda più.
- "Invia" non si spegne più durante un caricamento: aspetta che tutto sia
  caricato (`waitAll`), con la riga "Aspettiamo che il video finisca di
  caricarsi (45%), poi la richiesta parte da sola". Se un file non si carica la
  richiesta **non parte** e il messaggio lo dice vicino al pulsante; premendo
  di nuovo Invia si riprova.
- Avanzamento vero con `XMLHttpRequest` (`uploadGuidedRequestPhotoWithProgress`
  in `packages/api-client`), un nuovo tentativo automatico se la rete cade,
  "Riprova" sul riquadro, conferma del browser se si chiude la pagina mentre
  si carica o si invia.
- Peso (50 MB, `MEDIA_UPLOAD_MAX_BYTES` in `packages/shared/src/limits.ts`,
  lo stesso numero dell'API) e durata (1 minuto con 5 secondi di tolleranza,
  `MEDIA_VIDEO_MAX_SECONDS`) controllati appena si sceglie il video, con un
  messaggio chiaro, invece di scoprirlo dopo il caricamento. Il limite di 1
  minuto è stato poi scelto da Luca (vedi sotto).
- Da non registrati i file restano nel browser e si caricano all'invio, dopo
  l'accesso (Verbale Cognitivo F2.2, come prima).

**Verifica**: prova nel browser con Playwright, API finta e rete lenta
(200 KB/s): video da 3 MB, invio al 17% → la richiesta aspetta e parte con
foto e video; caricamento rifiutato due volte → la richiesta non parte e si
legge il messaggio, nuovo Invia → parte con il video; video di 75 secondi →
"Il video dura 75 secondi, il massimo è 1 minuto", video di 10 secondi
caricato. `pnpm typecheck` e `pnpm lint` di `apps/web` puliti.

## Secondo giro (stesso giorno): caricamento diretto, 480p, chat e "Le mie richieste"

**Richiesta** (Luca): "ok caricamento diretto", video "anche più piccoli" di
720p (scelto 480p), limite 1 minuto e 50 MB, stessa protezione nelle foto
aggiunte dopo e negli allegati della chat, piano di Cloudinary nella checklist.

**Decisione**:
- I video vanno dal browser direttamente a Cloudinary
  (`apps/web/src/lib/mediaUpload.ts`). L'API dà solo un permesso firmato
  (`POST /guided-requests/video-upload`, `CloudinaryService.signDirectVideoUpload`)
  che copre cartella, ora e trasformazione all'arrivo
  `c_limit,w_854,h_854,du_65,q_auto`: Cloudinary salva solo la copia in 480p,
  tagliata a 65 secondi anche se qualcuno salta il controllo del sito, e
  ricodificata (senza la posizione GPS). Con tanto traffico il file non passa
  più da Render. Foto e documenti restano sull'API (sono già piccoli).
- Se Cloudinary non dà il permesso (503, non configurato) o rifiuta la firma, il
  video passa dall'API come prima: il caricamento non si blocca mai.
- CSP: `connect-src` ammette `https://api.cloudinary.com`.
- "Le mie richieste" (foto aggiunte modificando una richiesta) e chat: stessi
  controlli di peso e durata prima di caricare, percentuale, video diretti a
  Cloudinary. Lì "Salva" e "Invia" erano già fermi durante il caricamento.
- Durata unica `MEDIA_VIDEO_MAX_SECONDS` (60) in `packages/shared/src/limits.ts`.
- Checklist del lancio, punto 5: piano di Cloudinary.

**Verifica**: Playwright con API finta e Cloudinary intercettato: il video va a
`api.cloudinary.com` con cartella e trasformazione firmate, non all'API, e la
richiesta parte con l'indirizzo di Cloudinary; con il permesso spento (503) il
video passa dall'API e la richiesta parte lo stesso. Test
`cloudinary-direct-video.test.ts`: la firma è quella di Cloudinary (SHA-1 dei
parametri in ordine più il segreto). Da provare dal vivo con le chiavi vere:
un video da iPhone in 4G (lo fa Luca).

## Terzo giro: solo indirizzi del nostro Cloudinary, file saltati uno per uno

**Richiesta** (Luca, "sì" alle migliorie proposte).

**Decisione**:
- `OwnMediaUrlsPipe` (`apps/api/src/common/own-media-urls.pipe.ts`), dopo la
  validazione zod: `photoUrls` e `mediaUrls` accettano solo
  `https://res.cloudinary.com/<CLOUDINARY_CLOUD_NAME>/…` nella richiesta
  (creazione e modifica), nella chat, nella chiusura del lavoro e nelle
  recensioni. Prima un indirizzo di un altro sito passava. Senza
  `CLOUDINARY_CLOUD_NAME` (prove in locale) non controlla.
- "Le mie richieste": con più file scelti insieme, uno che non va (troppo
  lungo, rete) viene saltato e detto in una riga, gli altri si caricano.

**Verifica**: test `own-media-urls.pipe.test.ts`; `typecheck` di sito e API.
