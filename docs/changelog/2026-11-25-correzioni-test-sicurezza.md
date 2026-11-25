# Correzioni dal test di sicurezza con attacco simulato

**Richiesta**: test di sicurezza completo del sito (revisione OWASP del
codice, ZAP e Nuclei dal vivo solo su Vercel e Render), rapporto in
`analisi/test-sicurezza-attacco-simulato.md` nei file del progetto. Luca:
"si a tutto" sulle correzioni proposte.

**Decisione e motivo**

1. **Indirizzo preciso mai nelle risposte pubbliche.** La pagina del
   professionista lo nascondeva già (scelta della Fase 5, "Nessun indirizzo
   esposto senza motivo"), ma l'API lo mandava lo stesso e finiva nel
   sorgente della pagina. Tolto `address` da `ProfessionalSearchResult` (e
   quindi da ricerca, pagina risultati, profilo, professionisti salvati); lo
   vede solo il professionista nel suo profilo. Le coordinate pubbliche
   (ricerca, profilo, mappa `/professionals/pins`, salvati) sono arrotondate
   a due decimali, circa 1 km (`publicCoordinate` in
   `packages/shared/src/professionals.ts`); distanze e smistamento sul server
   usano quelle esatte.
2. **Foto solo dal nostro Cloudinary anche in 4 punti mancanti**:
   `PUT /professionals/me` (`imageUrl`, `portfolioUrls`),
   `POST /bookings/:id/issue`, `POST /bookings/:id/professional-problem`,
   `PATCH /bookings/:id/job-payment/bank-dispute-note`. Prima un
   professionista poteva mettere nel profilo pubblico un'immagine ospitata da
   lui e vedere l'IP di ogni visitatore. `isOwnMediaUrl` accetta anche le
   immagini del sito stesso (`FRONTEND_URL`, per esempio `/copertine`).
3. **Tipo vero dei file caricati** (`apps/api/src/common/file-signature.ts`):
   un documento della chat deve essere davvero PDF, Word o Excel (primi
   byte) e prende l'estensione dal contenuto, non dal nome scelto da chi
   carica; prima una pagina `.html` dichiarata PDF finiva sul nostro
   Cloudinary. Le immagini che sono testo (SVG, HTML) vengono rifiutate in
   tutti i caricamenti (`uploadImage`, `uploadMedia`).
4. **Carattere nullo** nell'indirizzo o nel corpo JSON: 400 invece di un
   errore 500 da Postgres, che finiva anche in Sentry (`app-setup.ts`).
5. **Limiti stretti al minuto nel database** (tabella `rate_limit_hits`,
   `apps/api/src/common/shared-throttler-storage.ts`): i limiti fino a 20 al
   minuto (accesso, registrazione, recupero password, contatti…) valgono per
   tutte le copie dell'API e non ripartono a ogni aggiornamento. Il limite
   generale di 60 resta in memoria per non scrivere nel database a ogni
   chiamata. Se il database non risponde si conta in memoria. Nella chiave
   solo un'impronta, mai l'indirizzo IP.
6. **HSTS sull'API** (`Strict-Transport-Security`, due anni), come il sito.

**Verifica**: test dell'API (con i nuovi `file-signature.test.ts`,
`shared-throttler-storage.test.ts`, `app-setup-null.test.ts` e le prove nuove
di `own-media-urls.pipe.test.ts`), `publicCoordinate.test.ts`, typecheck e
lint di tutto il monorepo, test dei permessi (442 rotte, 1.827 controlli).
Con due copie dell'API accese in locale sullo stesso Postgres: 12 accessi
sbagliati alternati tra le due → l'undicesimo e il dodicesimo 429 (prima ne
servivano 21); `?city=%00` → 400; HSTS presente; `PUT /professionals/me` con
una foto esterna → 400; `GET /professionals/:id` senza `address` e con
coordinate `45.07, 7.69`.
