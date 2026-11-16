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

## Traffico elevato (docs/changelog/2026-11-16-traffico-elevato.md)

**Prima del lancio, una volta:**
1. Crea una chiave lunga, per esempio con `openssl rand -hex 32` o con un gestore di password (almeno 32
   caratteri).
2. Render → servizio API → Environment: `SITE_SERVER_KEY` = la chiave.
3. Vercel → progetto → Settings → Environment Variables (Production): `SITE_SERVER_KEY` = la stessa chiave,
   **senza** `NEXT_PUBLIC_`. Poi Deployments → **Redeploy**.
4. Controllo: apri la home e una pagina di ricerca; nei log di Render non devono comparire risposte 429.
   Senza chiave il sito funziona lo stesso, ma con traffico le pagine fatte da Vercel finiscono nel limite di
   60 chiamate al minuto e la ricerca risulta vuota.

**Piani:** al lancio API su **Standard** (1 CPU, 2 GB) e database su **Basic-1gb** (prima, fino alla società, Luca resta sui piani gratuiti: checklist di lancio, punto 4quater). Per più copie
dell'API basta alzare il numero di istanze su Render: tetti, biglietti ed eventi del tempo reale sono già
condivisi nel database.

**Protezione di Vercel (miglioria scelta da Luca il 16/11, 5 minuti, a mano):** serve contro chi scarica
il sito in massa con un programma. Le chiamate che le pagine fanno all'API non passano da qui, quindi non
ne sono toccate.
1. Vercel → progetto del sito → **Firewall** → **Configure** → **+ New Rule**.
2. Nome: `Limite per indirizzo`.
3. **If**: `Request Path` · `Starts with` · `/`, poi **and** `Request Path` · `Does not start with` ·
   `/_next/static` (i file del sito non contano).
4. **Then**: **Rate Limit**, finestra fissa di **60 secondi**, **600 richieste**, chiave **IP Address**,
   azione **Too Many Requests (429)**.
5. **Add Rule** (in alcune versioni "Save Rule") → **Review Changes** → **Publish**.
6. Controllo: apri il sito e sfoglia qualche pagina di ricerca e profilo; in Firewall → Traffic la regola deve
   restare a zero per te. Una persona vera fa poche decine di richieste al minuto, anche con le anteprime dei
   link che il sito carica in anticipo.

**Avvisi:** quando l'IA (testo o foto) arriva all'80% del tetto giornaliero arriva un avviso Sentry; al 100%
arriva quello di sempre e la funzione si ferma fino al giorno dopo.
