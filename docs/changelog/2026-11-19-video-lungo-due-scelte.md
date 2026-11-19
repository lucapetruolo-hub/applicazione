# Video più lungo di un minuto: due scelte invece di "Togli" (19/11/2026)

**Richiesta** (Luca, dalla prova su iPhone): la fotocamera del telefono non si
ferma da sola a un minuto, e con un video più lungo la richiesta mostrava solo
l'errore e "Togli". Luca: "dirglielo subito, il video deve essere massimo 1
minuto, con 2 scelte: tieni il video e taglialo a 1 minuto, rifai il video".

**Decisione**: nella richiesta di preventivo, appena il sito legge la durata,
il riquadro del video resta con la scritta "Troppo lungo" e sotto compare un
box ocra (non rosso: non è un errore) con "Il video dura X: il massimo è 1
minuto. Puoi tenerlo, al professionista arriva solo il primo minuto." e due
pulsanti: "Tieni il primo minuto" e "Rifai il video" (toglie il video e riapre
subito la scelta della fotocamera). Il taglio non si fa nel telefono
(sarebbe lento, soprattutto su iPhone): lo fa Cloudinary con la trasformazione
`du_65` che il caricamento diretto usa già; la stessa durata ora vale anche
nel ripiego dall'API (`CloudinaryService.uploadMedia`). Resta il limite di
peso di 50 MB: un video più pesante si rifiuta come prima.

**Dove non vale ancora**: in chat e in "Le mie richieste" (aggiunta di foto e
video dopo l'invio) il video lungo si rifiuta come prima.

**File**: `apps/web/src/lib/mediaUpload.ts` (`MediaTooLongError`),
`apps/web/src/lib/useRequestMedia.ts` (`keepFirstMinute`),
`apps/web/src/components/GuidedRequestForm.tsx`, `apps/web/src/app/globals.css`,
`apps/api/src/cloudinary/cloudinary.service.ts`.

**Verifica**: in locale con un video di 83 secondi, da telefono e da computer:
compare il box, "Tieni il primo minuto" lo fa sparire e lascia la riga "Del
video più lungo teniamo il primo minuto". Typecheck, lint e prove dell'API
verdi. Il taglio vero di Cloudinary si vede solo sul sito (prova a mano di
Luca, passo 15).
