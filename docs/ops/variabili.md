# Variabili d'ambiente

Tutte quelle dell'API stanno in `render.yaml` con un commento: la CI blocca
una variabile nuova del codice che non c'è (`apps/api/scripts/check-render-env.mjs`).
Ogni variabile nuova va aggiunta anche qui.

**Obbl.** = senza, una parte importante non funziona. Le `NEXT_PUBLIC_*` di
Vercel entrano nel sito alla build: dopo un cambio serve **Redeploy**.

## API (Render, `professionisti-api-eu`)

| Variabile | Obbl.? | Se manca |
|---|---|---|
| `DATABASE_URL` | Obbl. | L'API non parte (resta in linea la versione di prima) |
| `JWT_SECRET` | Obbl. | L'API non parte su Render |
| `FISCAL_DATA_KEY` | Obbl. | IBAN e codici fiscali cifrati con una chiave presa da `JWT_SECRET`: cambiando quella, illeggibili. Si imposta una volta, non si cambia |
| `FRONTEND_URL` | Obbl. | CORS sbagliato: il sito non parla con l'API. Cambia col dominio ([cambio-dominio.md](cambio-dominio.md)) |
| `LAUNCH_DATE` | Obbl. al lancio | Niente carta, niente pause, niente mesi gratis, numeri contati da sempre |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_WEBHOOK_SECRET` | Obbl. al lancio | Nessun pagamento; webhook rifiutati |
| `STRIPE_PRICE_BASE`, `_PLUS`, `_PRO` | Obbl. con Stripe | Checkout dell'abbonamento rifiutato |
| `STRIPE_PRICE_*_ANNUAL` | Fac. | Annuale non offerto (per ora non lo è) |
| `STRIPE_TAX_RATE_IVA` | Obbl. con Stripe | **Nessun abbonamento si compra** |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Obbl. al lancio | Nessuna email |
| `EMAIL_VERIFICATION_REQUIRED` | Fac. | Conferma dell'email non obbligatoria |
| `EMAIL_LOGO_URL` | Fac. | Logo = icona del sito |
| `SENTRY_DSN` | Di fatto obbl. | Nessun errore e nessun avviso arriva a nessuno |
| `TURNSTILE_SECRET_KEY` | Fac. | Anti-bot spento |
| `GOOGLE_CLIENT_ID` | Fac. | Accesso con Google rifiutato |
| `GOOGLE_MAPS_API_KEY` | Fac. | Centro del comune, niente suggerimenti di indirizzo, niente mappa fissa |
| `GOOGLE_PUBLIC_DAILY_LIMIT` | Fac. | Tetti di serie al giorno: suggerimenti 1000, dettagli e CAP 500, mappe fisse 500 |
| `CLOUDINARY_*` | Fac. | Niente foto |
| `OPENAPI_TOKEN_RISK`, `OPENAPI_TOKEN_COMPANY`, `OPENAPI_SANDBOX` | Fac. | Controllo CF/P.IVA saltato (non blocca) |
| `OPENAPI_TOKEN_SDI` | Fac. | Fatture emesse, XML da scaricare a mano |
| `DIDIT_API_KEY`, `DIDIT_WORKFLOW_ID`, `DIDIT_WEBHOOK_SECRET`, `DIDIT_SANDBOX` | Fac. | Verifica identità non richiesta |
| `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `PROBLEM_MATCH_AI_DAILY_LIMIT` | Fac. | Solo dizionario |
| `PHOTO_SEARCH_ENABLED` | Fac. (`true` accende, serve `ANTHROPIC_API_KEY`) | Niente pulsante "Aggiungi una foto" |
| `WHATSAPP_ACCESS_TOKEN`, `_PHONE_NUMBER_ID`, `_APP_SECRET`, `_WEBHOOK_VERIFY_TOKEN`, `_DAILY_LIMIT` | Fac. | WhatsApp spento |
| `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_PRICE_*` | Fac. | Valori di serie |
| `GENERAL_REQUESTS_ENABLED` | Fac. (`false` spegne) | Richieste generali attive |
| `ADMIN_BOOTSTRAP_SECRET` | Fino al primo admin | Primo admin impossibile; poi va tolta |
| `RATE_LIMIT_PER_MINUTE`, `TZ` | **Mai in produzione** | — |

## Sito (Vercel)

| Variabile | Obbl.? | Se manca |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | Obbl. | Il sito cerca l'API su localhost: vuoto |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Fac. | Pulsante Google non funziona |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Fac. | "Mappa non disponibile" / mappa di prova |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Fac. | Anti-bot spento (va messa **prima** di quella su Render) |
| `NEXT_PUBLIC_SITE_INDEXABLE` | Il giorno del lancio | Sito `noindex` |
| `ADMIN_ENTRY_PATH` | Fac. | `/admin` raggiungibile da tutti (resta protetto dall'API) |

## GitHub (Actions)

| Nome | Tipo | Se manca |
|---|---|---|
| `API_HEALTH_URL`, `SITE_URL` | Variables | Uptime saltato |
| `UPTIME_EMAIL`, `UPTIME_PASSWORD` | Secrets | Controllo dello stream rosso (apposta) |
| `E2E_STRIPE_SECRET_KEY` | Secret | Prova della carta: saltata sulle PR, rossa sul ramo principale |
