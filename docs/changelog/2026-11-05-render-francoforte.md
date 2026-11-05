# API e database a Francoforte, a pagamento

**Richiesta** (Luca, 05/11/2026): il database gratuito di Render è scaduto
quel giorno e l'API rispondeva "errore 500" a tutto quello che legge dal
database (ricerca, richieste, accesso). Luca ha seguito la guida
`analisi/spostamento-render-francoforte.md` (decisione del 26/10: spostare
tutto a Francoforte quando si passa a pagamento).

**Decisione / fatto da Luca**:
- Postgres `professionisti-db-eu` Basic-256mb e API `professionisti-api-eu`
  Starter a Frankfurt (`https://professionisti-api-eu.onrender.com`). Database
  nuovo e vuoto: tabelle e categorie si creano da sole all'avvio, account di
  prova e accesso admin vanno rifatti.
- Vercel: `NEXT_PUBLIC_API_URL` sul nuovo indirizzo (anche la CSP lo prende
  da lì) e Function Region `fra1`.
- Webhook Stripe di prova (`/billing/webhook`) e Didit di prova
  (`/identity-verification/webhook`, segreto nuovo) sul nuovo indirizzo;
  `API_HEALTH_URL` di GitHub aggiornata.

**Nel repo**: `render.yaml` con nome, `region: frankfurt` e `plan: starter`;
indirizzo del webhook di Meta in `docs/whatsapp-modelli.md`; checklist di
lancio (punti 4bis e 4ter fatti), skill `deploy-ops` e tabella dello stack in
`CLAUDE.md`.

**Indirizzo dell'API senza barra finale**: durante la migrazione
`NEXT_PUBLIC_API_URL` con la "/" in fondo faceva rispondere 404 a ogni
chiamata, e la ricerca mostrava "nessuno vicino" invece di un errore. Ora il
sito (`apps/web/src/lib/apiUrl.ts`) e `createApiClient` di
`packages/api-client` tolgono la barra finale.

**Da finire**: sospendere il vecchio `professionisti-api` (Oregon), eliminare
il vecchio endpoint Didit e, se il vecchio servizio era collegato a un
Blueprint, scollegarlo prima che `render.yaml` arrivi sul ramo principale
(con il nome nuovo una sincronizzazione potrebbe creare un secondo servizio).

**Verifica** (05/11, 10:30): `/health` del nuovo servizio `{"status":"ok"}` e
`/professionals/category-counts` 200; i file JavaScript del sito contengono
solo `professionisti-api-eu.onrender.com`; la CSP del sito ha il nuovo
indirizzo in `connect-src`; le pagine rispondono da `fra1`.
