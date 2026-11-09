# Avvisi: chi si accorge che qualcosa non va

| Cosa | Chi lo vede | Come arriva |
|---|---|---|
| API o database giù (sul telefono) | UptimeRobot, ogni 5 minuti su `/health/db` e sulla homepage | Notifica dell'app UptimeRobot ed email, anche di notte; un'altra quando torna su |
| API o database giù | Uptime (`.github/workflows/uptime.yml`, ogni 10 minuti su `/health/db` e sulla homepage) | Email di GitHub a chi ha le notifiche di Actions accese (di solito chi ha toccato per ultimo il workflow): una sola al primo giro rosso |
| Stream in tempo reale muto | Uptime, ogni ora | Come sopra. Servono i segreti `UPTIME_EMAIL` e `UPTIME_PASSWORD` (un account di prova); senza, il controllo fallisce apposta |
| Suggerimenti di indirizzo rotti (chiave Google) | Uptime, una volta al giorno alle 7:17 UTC | Come sopra |
| Errori 500, attività a orario fallite | Sentry (con `SENTRY_DSN` su Render) | Email di Sentry, se gli avvisi sono accesi in Sentry → Alerts |
| Servizio esterno giù o al limite (Google, Resend al limite delle email o con la chiave rifiutata, …) | Sentry, al massimo una volta l'ora per tipo (`opsAlert`) | Come sopra |
| Deploy fallito | Render | Email di Render al titolare dell'account |
| Fatture scartate dallo SdI, quadratura, versione di PostgreSQL | Super admin | Notifica ed email del sito |

## Da controllare una volta (Luca)

- In GitHub → Settings → Notifications → **Actions**: "Notify me" per i
  workflow falliti, alla casella che si legge davvero.
- In Sentry → Alerts: una regola "nuovo problema" con email, poi un errore di
  prova.
- Segreti `UPTIME_EMAIL`/`UPTIME_PASSWORD`: il database è nuovo dal 05/11,
  quindi l'account di prova va rifatto e i segreti aggiornati. Poi Actions →
  Uptime → **Run workflow**: tutti i passi verdi.
- Segreto `E2E_STRIPE_SECRET_KEY`: senza, la prova della carta sul ramo
  principale fallisce apposta.
- Facoltativo: in Render → servizio → **Notifications**, un avviso se la
  memoria supera 400 MB.

## UptimeRobot: come si imposta (una volta, 10 minuti)

Deciso da Luca il 09/11/2026: le email di GitHub e Sentry si leggono quando
si leggono, UptimeRobot avvisa sul telefono. Piano gratuito, senza carta.

1. Iscriversi su https://uptimerobot.com (piano **Free**) con l'email che si
   legge davvero, e installare l'app **UptimeRobot** sul telefono (stesso
   account). Nell'app permettere le notifiche.
2. **+ New monitor** → tipo **HTTP(s)** → nome `API e database` → URL
   `https://professionisti-api-eu.onrender.com/health/db` → intervallo
   **5 minuti** → in "How will we notify you?" spuntare email e app
   (mobile push) → **Create monitor**.
3. Di nuovo **+ New monitor** → **HTTP(s)** → nome `Sito` → URL
   `https://applicazione-web.vercel.app` (al cambio di dominio: quello nuovo,
   [cambio-dominio.md](cambio-dominio.md)) → 5 minuti → stesse notifiche.
4. Prova: nell'app i due monitor devono essere verdi ("Up"). Per vedere
   arrivare un avviso, creare un terzo monitor su un indirizzo che non
   esiste (es. `https://professionisti-api-eu.onrender.com/non-esiste`),
   aspettare la notifica e poi cancellarlo.

`/health/db` risponde 503 se il database non risponde: UptimeRobot lo
segna giù. Un singolo rallentamento non manda nulla (UptimeRobot riprova
prima di avvisare).
