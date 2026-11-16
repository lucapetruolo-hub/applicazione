# Proteggere account, chiavi e copie (da fare a mano, Luca)

Passi da fare una volta nei propri account, in ordine di importanza. Nata il
16/11/2026 (docs/changelog/2026-11-16-backup-e-piano-di-emergenza.md). Il
repo è pubblico: qui solo i passi, **mai una chiave o una password**.

Spuntare a mano man mano (anche nella skill `checklist-lancio`, punto 28).

## 1. Database a pagamento (subito, 5 minuti)

- [ ] Render → `professionisti-db-eu` → **Info → Plan** → **Basic** (o
      superiore). Il piano Free non fa backup e scade il 05/12/2026.
- [ ] Dopo il cambio: Render → database → **Recovery**. Deve comparire il
      ripristino a un istante (Point-in-Time Recovery).

## 2. Gestore di password (30 minuti)

Bitwarden (gratis, dati in UE con il server europeo) oppure 1Password.

- [ ] Creare l'account con una frase lunga che ricordi solo tu, e la verifica
      in due passaggi.
- [ ] Una cartella "Sito" con una voce per servizio: GitHub, Render, Vercel,
      Stripe, Cloudinary, Resend, Google Cloud, Didit, Openapi, Anthropic,
      Cloudflare, UptimeRobot, Sentry, il dominio quando c'è.
- [ ] Copiare lì **tutte le variabili** di Render (`professionisti-api-eu` →
      Environment) e di Vercel (Settings → Environment Variables). Elenco
      completo in [variabili.md](variabili.md).
- [ ] **`FISCAL_DATA_KEY`**: in una voce a parte e anche su un foglio di carta
      chiuso in un posto sicuro. Se si perde, IBAN e codici fiscali salvati non
      si leggono più, nemmeno dai backup.
- [ ] Il link segreto dell'admin (`ADMIN_ENTRY_PATH`).
- [ ] I **codici di recupero** della verifica in due passaggi di ogni servizio
      (punto 3).
- [ ] **Accesso di emergenza** (Bitwarden: Impostazioni → Accesso di
      emergenza; 1Password: Kit di emergenza) per una persona di fiducia,
      con qualche giorno di attesa prima che possa entrare. Oggi tutto dipende
      da te.

## 3. Verifica in due passaggi (1 ora in tutto)

Con un'app (Google Authenticator, Authy, quella del gestore di password) o
con una passkey. **Non con SMS**: un numero si può rubare in negozio.

- [ ] **Gmail per primo**: è la chiave di tutto, perché ogni "password
      dimenticata" arriva lì. Google → Sicurezza → passkey + codici di
      backup; controllare email e telefono di recupero.
- [ ] GitHub (Settings → Password and authentication)
- [ ] Render (Account Settings → Security)
- [ ] Vercel (Account → Authentication)
- [ ] Stripe (Profilo → Sicurezza)
- [ ] Cloudinary, Resend, Google Cloud (stesso account Gmail), Didit,
      Openapi, Anthropic, Cloudflare, Sentry, UptimeRobot
- [ ] Admin del sito: verifica in due passaggi accesa e almeno **due super
      admin** (checklist di lancio, punto 28).

## 4. Pagamenti dei servizi (10 minuti)

- [ ] Su Render, Vercel e Cloudinary una carta valida e, dove si può, una
      seconda di riserva. Una carta scaduta vuol dire servizi sospesi.
- [ ] Le email di fatturazione vanno a una casella che leggi.

## 5. Copie di codice e documenti (20 minuti, poi una volta al mese)

- [ ] **Time Machine** su un disco esterno e **FileVault** acceso
      (Impostazioni di Sistema → Privacy e sicurezza).
- [ ] Una volta al mese, nel Terminale, dalla cartella del progetto:
      `git fetch --all && git bundle create ~/Desktop/copia-repo-$(date +%F).bundle --all`
      e spostare il file sul disco esterno. È tutto il repo con la sua storia:
      serve se l'account GitHub viene bloccato.
- [ ] Cartella condivisa del progetto (analisi, collaudi, foto): scaricarla
      sul Mac, così entra anche in Time Machine. Oggi esiste solo online.

## 6. Avvisi (10 minuti)

- [ ] UptimeRobot, avvisi di Sentry e notifiche di GitHub Actions: passi in
      [avvisi.md](avvisi.md).

## 7. Dominio (quando lo compri)

- [ ] Rinnovo automatico acceso, con la carta di riserva.
- [ ] Blocco del trasferimento (Transfer lock / Registrar lock) acceso.
- [ ] Verifica in due passaggi sull'account del registrar.

## 8. Prova di ripristino (prima del lancio, poi ogni 3 mesi)

- [ ] Seguire [ripristino.md](ripristino.md) fino al punto 3 (database nuovo
      creato), aprirlo e vedere che ci sono le tabelle, **senza** cambiare
      `DATABASE_URL`. Poi cancellare il database di prova, perché si paga.
- [ ] Annotare quanto ci è voluto e correggere la guida dove non tornava.

## 9. Privacy dei backup

- [ ] Nel **registro dei trattamenti** (dall'avvocato o dal commercialista):
      copie di sicurezza su Render, Francoforte (UE), cifrate, per al massimo
      30 giorni.
- [ ] Se si aggiunge la copia esterna: contratto sul trattamento dei dati
      (DPA) con il fornitore, server in UE.
