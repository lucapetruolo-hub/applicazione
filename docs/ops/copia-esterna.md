# Copia esterna del database (Backblaze B2)

Decisione di Luca del 16/11/2026: oltre ai backup di Render, una copia cifrata
del database a settimana **fuori da Render**, in UE, tenuta 30 giorni. La fa
da sola `.github/workflows/copia-database.yml`, la domenica alle 03:15 UTC.
Finché mancano i segreti qui sotto è spenta (il giro si salta e resta verde).

Da accendere **insieme al passaggio del database a Basic**, prima che entrino
dati veri (checklist di lancio, punto 28): oggi nel database ci sono solo
account di prova.

## Cosa preparare, una volta

1. **Backblaze B2**: crea un account con la regione **EU Central (Amsterdam)**.
   La regione si sceglie alla creazione dell'account e non si cambia dopo.
2. **Bucket**: privato, con "Object Lock" spento e cifratura lato server
   accesa. In *Lifecycle Settings* scegli "Use custom lifecycle rules" per il
   prefisso `database/`: nascondi dopo **30** giorni dal caricamento, cancella
   dopo **1** giorno da quando è nascosto. Non più di 30: lo promette la
   Privacy (punto 5).
3. **Chiave**: *Application Keys → Add a New Application Key*, solo quel
   bucket, tipo di accesso **Write Only**. Così chi rubasse la chiave non può
   leggere né cancellare le copie.
4. **Frase per cifrare**: una frase lunga e casuale (almeno 6 parole). Va nel
   gestore di password **e su carta**, come `FISCAL_DATA_KEY`: senza, le copie
   non si aprono più.
5. **GitHub** → Settings → Secrets and variables → Actions:
   - Secrets: `BACKUP_DATABASE_URL` (Render → database → *External Database
     URL*), `BACKUP_PASSPHRASE`, `B2_KEY_ID`, `B2_APPLICATION_KEY`;
   - Variables: `B2_BUCKET`, `B2_ENDPOINT` (lo dice la pagina del bucket, es.
     `https://s3.eu-central-003.backblazeb2.com`).
6. **Render**: se il database ha la lista degli indirizzi ammessi, GitHub deve
   poter entrare (gli indirizzi di GitHub cambiano: serve "0.0.0.0/0" con la
   sola password a proteggere, oppure la copia va fatta da un Cron Job di
   Render). Da decidere al passaggio a Basic.
7. **Prima prova**: Actions → "Copia del database" → *Run workflow*. Deve
   finire verde e nel bucket deve comparire `database/professionisti-AAAA-MM-GG.dump.gpg`.

Se un giro fallisce il workflow diventa rosso e GitHub manda l'email.

## Ripristinare da una copia

Su un computer con PostgreSQL della **stessa versione principale** del
database (il giro la scrive nel suo registro) e `gpg`:

```bash
gpg --decrypt professionisti-AAAA-MM-GG.dump.gpg > copia.dump   # chiede la frase
pg_restore --no-owner --no-privileges --dbname "<indirizzo del database nuovo, vuoto>" copia.dump
rm copia.dump
```

Poi i passi di `docs/ops/ripristino.md` (variabili dell'API, controllo di
`/health/db`). **Provare il ripristino una volta su un database di prova prima
del lancio**: una copia mai provata non è una copia.

## Cosa c'è dentro

Tutto il database, quindi dati personali: per questo è cifrata prima di
lasciare GitHub, sta in UE e si cancella dopo 30 giorni. **Il giorno in cui si
accende, Backblaze va aggiunto ai fornitori della Privacy (punto 4)**, con la
data della pagina aggiornata: non prima, perché oggi non riceve niente.
