# Sito più veloce da telefono e piccole correzioni SEO (collaudo, gruppo 11)

**Richiesta**: Luca ha chiesto di fare tutti i gruppi di correzioni del
collaudo del 29/10 (`collaudo/2026-10-29/riepilogo.md`). Questo è il gruppo 11
"SEO e velocità", difetti N-01…N-15 dell'agente N.

**Decisioni e motivi**

- **Meno JavaScript su ogni pagina (N-01)**. Tre cose finivano nel JavaScript
  di quasi tutte le pagine senza servire:
  - l'elenco di tutti i comuni (circa 440 KB non compressi): ora i
    suggerimenti delle città lo scaricano a parte (`apps/web/src/lib/comuniLazy.ts`)
    solo quando si tocca un campo, e `buildSearchDestination` lo carica al
    momento della ricerca. I codici catastali (per il luogo di nascita dal
    codice fiscale) stanno in un file a parte (`codiceFiscaleBirthPlace.ts`),
    e `PopularServicesLinks` riceve lo slug della città da chi lo chiama
    invece di calcolarlo (stava nella pagina "non trovata", caricata ovunque);
  - zod intero: gli schemi di notifiche, ruoli admin, verifica identità e
    provenienza delle visite sono in file `*Schemas.ts` separati, così chi usa
    solo le costanti non si porta dietro zod;
  - la mappa dei risultati riceveva tutti i professionisti della città
    dentro la pagina: ora li chiede solo quando la mappa si apre (`mapPool`).
- **Pagina città più rapida (N-02)**: la ricerca principale parte per prima;
  prezzi medi, servizi più richiesti e numeri della città arrivano dopo in
  `<Suspense>`, senza far aspettare la lista. La prima foto dei risultati ha
  `priority`.
- **Foto dei mestieri in home (N-08)**: copie da 480/768/1024 px
  (`apps/web/scripts/riduci-foto-mestieri.mjs`), scelte dal loader di
  `next/image` secondo la larghezza; prima si scaricava sempre l'originale da
  1536 px.
- **Profilo (N-09)**: l'agenda arriva già dal server (non salta più la
  pagina); il banner cookie è nell'HTML e uno script in testa lo nasconde
  subito a chi ha già scelto (`cookieChoiceBoot.ts`).
- **Link tra le pagine (N-07, N-13)**: nella pagina di un mestiere senza
  città, "<Mestiere> nelle città" con le città dove ci sono professionisti
  (`CategoryCityLinks.tsx`); nel piede pagina prima i quattro mestieri del
  lancio (con Falegname) e "Tutti i servizi".
- **Dati strutturati e titoli (N-10, N-11)**: in home `WebSite` e
  `Organization`; nel profilo il tipo di attività per mestiere
  (`Plumber`, `Electrician`, ...) con `areaServed` e la foto per le
  anteprime; "1 recensione" al singolare; titolo della home senza ripetizioni;
  descrizioni delle pagine mestiere con la domanda giusta per il mestiere.
- **Indirizzi con le maiuscole (N-12)**: `/cerca/Idraulico/Latina` porta con
  un 308 a `/cerca/idraulico/latina`, mantenendo i parametri.

**Non fatto, di proposito**

- N-03 e N-14: già a posto al lancio (città sotto il minimo di professionisti
  in `noindex` e fuori dalla sitemap; la riga della sitemap in `robots.txt`
  compare solo con `NEXT_PUBLIC_SITE_INDEXABLE=true`).
- N-12, pagina "non trovata" vuota senza JavaScript per profili e città: è un
  limite di Next.js 15 (un `notFound()` in una pagina generata a ogni
  richiesta manda l'HTML d'errore e il contenuto lo disegna il browser,
  vercel/next.js#62228). Provati `connection()` al posto di `force-dynamic`,
  un `not-found.tsx` per cartella e senza `generateMetadata`: stesso
  risultato. Il codice di risposta resta 404, quindi Google non la indicizza.

**Verifica**

- Build, `pnpm typecheck` e `pnpm lint` di `apps/web` verdi; test di
  `packages/shared` e dei controlli fiscali dell'API verdi.
- First Load JS dal build: home 444 → 265 KB, pagine città 475 → 295 KB,
  `/cerca` 506 → 325 KB, registrazione 484 → 303 KB.
- Playwright con Moto G4, CPU rallentata 4 volte e rete lenta, mediana di 3,
  sito locale (stessa API di Render) contro produzione, due giri:
  - home: JavaScript scaricato 536 → 323 KB, contenuto principale 2,5-2,7 s →
    1,9 s;
  - `/cerca/idraulico/latina`: primo byte 4,7-5,0 s → 1,4-1,6 s, contenuto
    principale 7,7-8,2 s → 1,9-2,0 s, tempo bloccato 1,35-1,5 s → 0,85-1,0 s.
- Prove a schermo da iPhone: home, città, mestiere e profilo come prima.

## Migliorie (stesso giorno)

**Richiesta**: Luca, dopo l'elenco delle migliorie della PR: "Effettua tutte
le migliorie". Quella su Render a pagamento resta a lui (non è codice).

- **Testo proprio per ogni città (N-04)**: in "[Lavoro] a [città] in breve"
  i lavori offerti lì e le ultime 3 recensioni del mestiere in quella città
  (`GET /reviews/recent?category=&city=`, stessi filtri delle recensioni in
  home più categoria, anche secondaria, e città del professionista). I numeri
  restano nelle tessere; il testo li ripete solo con un professionista.
- **Pagine "Quanto costa" raggiungibili (N-05)**: nuova `/prezzi` con i
  mestieri che hanno una pagina prezzi (stesse soglie della sitemap del §296,
  in sitemap solo se ne ha almeno una), link "Prezzi per mestiere" sotto
  "Quanto costa in media?" in home e nel piede pagina. Il menu "Quanto costa"
  in alto resta allo strumento della home (decisione di Luca, §398).
- **"Quanto costa in media?" senza attese (N-06)**: i prezzi arrivano con la
  pagina dal server, quindi niente "Caricamento..." e Google li legge. Le
  cifre restano solo da 3 professionisti (§398): finché nessun lavoro ci
  arriva, la riga sopra dice questo invece di promettere "prezzi veri".
- **Elenco dei comuni a parte anche in Richiedi preventivo e Urgente**:
  primo caricamento da 431 a 321 KB. Si scarica subito dopo la pagina; se
  non è ancora arrivato quando si invia, la città la controlla il server.
- **Titolo visibile da telefono (N-15, scelto da Luca)**: "Idraulico a
  Latina" sopra i filtri fino a 1020 px; da computer resta solo per Google e
  i lettori di schermo come deciso nel §271. Senza risultati resta nascosto:
  il titolo c'è già nel riquadro "nessun professionista".

**Verifica**: typecheck e lint di `apps/web`, typecheck e test delle
recensioni dell'API verdi; prove a schermo da iPhone (titolo, testo della
città con le recensioni, `/prezzi`, prezzi in home) e da computer (titolo non
visibile).

**Link alle pagine città solo da 3 professionisti** (Luca, dopo le foto:
"un numero minimo per farlo vedere sul nostro sito... tutta la pagina quindi
il link cliccabile"): "[Mestiere] nelle città" e "Servizi più richiesti a
[città]" collegano una pagina città solo con almeno 3 professionisti
(`MIN_PROFESSIONALS_TO_INDEX_CITY`, la stessa soglia per entrare in Google).
La pagina resta raggiungibile dalla ricerca e dal profilo di chi c'è.
