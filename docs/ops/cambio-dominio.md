# Cambio di dominio

Il giorno del dominio vero (checklist di lancio, punto 30) vanno cambiate
**tutte** queste cose, nello stesso giro. Se se ne dimentica una, il sito si
rompe in un modo diverso per ognuna. Prima si fa tutto con il sito ancora
`noindex`; solo dopo, a prova finita, si apre a Google (punto 36).

| # | Dove | Cosa | Se si dimentica |
|---|---|---|---|
| 1 | Vercel → Domains | Aggiungere il dominio, DNS dal registrar, redirect permanente da `applicazione-web.vercel.app` | Il dominio non apre |
| 2 | Codice: `apps/web/src/lib/siteUrl.ts` (PR) | `SITE_URL` | Canonical, sitemap e anteprime puntano al vecchio |
| 3 | Render → Environment (e `render.yaml`, PR) | `FRONTEND_URL` | **Dal dominio nuovo nessuna chiamata all'API passa** (CORS): sito vuoto. Anche i link nelle email e i ritorni da Stripe vanno al vecchio |
| 4 | Google Cloud → Credenziali → Client OAuth | Origini JavaScript e URI `https://<dominio>/accesso-google` | "Accedi con Google" non funziona |
| 5 | Google Cloud → Credenziali → chiave del browser | Siti autorizzati `https://<dominio>/*` | Mappa non disponibile |
| 6 | Cloudflare → Turnstile → widget | Aggiungere il dominio | Iscrizione e "Password dimenticata" bloccate |
| 7 | Resend → Domains, poi Render | Dominio verificato (SPF, DKIM, DMARC), poi `RESEND_FROM_EMAIL` con il dominio | Email in spam o rifiutate |
| 8 | GitHub → Settings → Variables | `SITE_URL` dell'uptime | L'uptime controlla il vecchio indirizzo |
| 9 | Stripe → Impostazioni | Indirizzo del sito, Customer Portal, descrittore se cita il dominio | Ritorni e ricevute con il vecchio indirizzo |
| 10 | Didit, Openapi | Nessun cambio (parlano con l'API, non col sito) | — |

## Prova dopo il cambio

1. Dal dominio nuovo: una ricerca mostra professionisti (CORS a posto).
2. Accesso con Google funziona.
3. Iscrizione con email: il widget anti-bot compare, l'email arriva in posta
   in arrivo (non in spam), il link porta al dominio nuovo.
4. `curl -I https://<dominio>/` mostra ancora `x-robots-tag: noindex`.
5. `curl -I https://applicazione-web.vercel.app/` porta al dominio nuovo.
6. Uptime: Actions → Uptime → Run workflow, tutto verde.
