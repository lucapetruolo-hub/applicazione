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
  `REQUEST_VIDEO_MAX_SECONDS`) controllati appena si sceglie il video, con un
  messaggio chiaro, invece di scoprirlo dopo il caricamento. Il limite di 1
  minuto è la proposta in attesa della scelta di Luca nel thread.
- Da non registrati i file restano nel browser e si caricano all'invio, dopo
  l'accesso (Verbale Cognitivo F2.2, come prima).

**Verifica**: prova nel browser con Playwright, API finta e rete lenta
(200 KB/s): video da 3 MB, invio al 17% → la richiesta aspetta e parte con
foto e video; caricamento rifiutato due volte → la richiesta non parte e si
legge il messaggio, nuovo Invia → parte con il video; video di 75 secondi →
"Il video dura 75 secondi, il massimo è 1 minuto", video di 10 secondi
caricato. `pnpm typecheck` e `pnpm lint` di `apps/web` puliti.
