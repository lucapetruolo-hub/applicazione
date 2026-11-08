# Avvisi: chi si accorge che qualcosa non va

| Cosa | Chi lo vede | Come arriva |
|---|---|---|
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

## Manca (da decidere)

Nessun avviso arriva sul telefono di notte: le email di GitHub e Sentry si
leggono quando si leggono. Un controllo esterno con avviso sul telefono
(UptimeRobot o Better Stack, piani gratuiti) è un servizio nuovo: va prima
deciso con Luca e scritto in CLAUDE.md.
