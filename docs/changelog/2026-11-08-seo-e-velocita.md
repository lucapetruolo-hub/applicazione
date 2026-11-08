# SEO e velocità (gruppo 9 del controllo pre-lancio dell'08/11)

**Richiesta**: Luca, 08/11/2026, sul controllo completo prima del lancio
(`collaudo/2026-11-08/riepilogo.md` nella cartella del progetto): "sì a tutto
quello che ritieni". Gruppo 9, difetti E8-02…E8-11 dell'esperto SEO e
prestazioni, con le migliorie "sì" dello stesso tema. E8-01 ("undefined" nel
prezzo delle schede) è nel gruppo 1.

## Cosa cambia

- **E8-02, pagine vuote su rete lenta.** `/preventivo` e `/urgente` mostrano
  sotto il titolo la sagoma del modulo con "Stiamo preparando il modulo…"
  (`GuidedRequestHeading` in `GuidedRequestForm.tsx`). Le pagine dell'area
  personale e professionale, accesso, iscrizione e quelle aperte dalle email
  mostrano la sagoma della pagina con "Caricamento…" (`components/PageLoading.tsx`)
  al posto di `return null` e `<Suspense fallback={null}>`. La sagoma è
  nell'HTML del server: su 3G lento (50 KB/s, CPU ×4) a 5 secondi si vede già,
  prima si vedeva un vuoto fino a 10-20 secondi. La barra in cima non si
  accende all'apertura diretta: è JavaScript, arriverebbe dopo la sagoma.
- **E8-03, velocità da telefono.** La schermata dell'agenda di
  `/per-professionisti` (l'elemento più grande, LCP) ha `fetchpriority="high"`
  e un `preload` in testa alla pagina, per telefono e computer: con Next.js 16
  `priority` di `getImageProps` non scrive più `fetchpriority`. Ora è la prima
  risorsa scaricata (28 ms dopo la pagina, prima di CSS e JavaScript). Foto
  dei mestieri in home in una copia nuova da 600 px per i telefoni
  (`scripts/riduci-foto-mestieri.mjs`, `cloudinaryImageLoader.ts`): le 6 foto
  del primo schermo pesano 154 KB invece di 216 KB.
  Lighthouse simulato non si muove (LCP 3,8 s, TBT 0,5-0,7 s): conta come
  attesa tutto il JavaScript chiesto prima del disegno. Il resto è il
  JavaScript comune (React + Tamagui), lavoro a parte.
- **E8-04, profili di prova in Google.** L'API manda `indexable: false` per
  gli account di prova e i profili d'esempio (`ProfessionalDetail.indexable`);
  il profilo resta apribile dal link ma ha `noindex` e niente dati strutturati
  da attività vera.
- **E8-05, pagina per servizio.** H1 "Idraulico a Latina: caldaie", come il
  titolo della pagina, non più uguale alla pagina città.
- **E8-06, anteprime dei link.** `og:site_name`, `og:locale` `it_IT`,
  `og:type` su tutte le pagine (layout), `og:url` su home, mestiere, città,
  servizio, profilo, `/per-professionisti`, `/prezzi` (`lib/openGraph.ts`:
  una pagina che scrive il suo `openGraph` sostituisce quello del layout e
  perdeva l'immagine). Il profilo ha un'immagine sua
  (`professionista/[id]/opengraph-image.tsx`): foto (o iniziali), nome,
  mestiere e città sul verde del sito.
- **E8-07, pagine private.** `layout.tsx` con titolo e `noindex` per
  `/chat`, `/account`, `/le-mie-richieste`, `/dashboard`, `/segnalazioni`,
  `/professionisti-salvati`, `/le-mie-recensioni`, `/completa-profilo`,
  `/conferma-email`, `/notifiche`, `/promemoria`, `/verifica-legale`. Le
  pagine aperte dalle email **non** vanno in `robots.txt`: il divieto di
  scansione impedirebbe a Google di leggere il `noindex`. Il titolo delle
  sotto-pagine della dashboard e gli H1 dell'area riservata restano a E7-01
  (gruppo 8, accessibilità).
- **E8-09, dominio.** `SITE_URL` legge `NEXT_PUBLIC_SITE_URL` (solo
  un'origine http/https, senza barra finale; altrimenti l'indirizzo di
  Vercel). Il giorno del lancio basta la variabile su Vercel e un deploy
  (checklist di lancio punto 30). Anche il controllo SEO della CI la legge.
- **E8-10, sitemap.** La parte che chiede all'API (una ventina di chiamate)
  resta in memoria un'ora (`unstable_cache`); la sitemap si fa sempre alla
  richiesta, mai nella build (lì l'API può non rispondere). Se la ricerca non
  risponde non si tiene nulla. `lastModified` non c'è: la ricerca non manda
  la data di modifica del profilo.
- **E8-11.** Il profilo chiedeva lo stesso professionista due volte all'API
  (metadati e pagina): ora una (`React.cache`). La pagina città fa due
  ricerche diverse (una senza i profili d'esempio, solo col sito aperto):
  da misurare il giorno dopo il lancio come proposto dall'esperto.
- **E8-08** resta un limite di Next.js (pagina "non trovata" dinamica vuota
  senza JavaScript), già documentato in `2026-10-30-velocita-telefono.md`.

## Verifica

- `pnpm lint`, `pnpm typecheck` (web), lint API, 1286 test API verdi.
- Controllo SEO della CI (`apps/web/scripts/seo-check`) sito aperto e sito
  privato verdi, con controlli nuovi: profilo di prova in `noindex` senza
  dati strutturati, H1 della pagina per servizio, `og:site_name`/`og:locale`/
  `og:url`/`og:image` su città, profilo e home, immagine del profilo,
  titolo e `noindex` delle pagine private.
- Playwright su 3G lento a 390×844: foto a 5 secondi di `/preventivo` e
  `/le-mie-richieste` con la sagoma e la scritta.
- Lighthouse telefono su `/per-professionisti` e home (build locale, API
  finta): schermata dell'agenda prima risorsa scaricata con priorità alta.
