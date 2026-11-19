# Prova di ogni notte sul sito vero

**Richiesta** (Luca, 19/11/2026, dopo il collaudo totale): sì alla prova
automatica ogni notte contro il sito pubblicato (richiesta, preventivo,
accettazione fino a Stripe) e al controllo su Safari e Firefox.

**Decisione**
- `.github/workflows/notte.yml`, ogni notte alle 2:40 UTC e a mano da Actions.
  Usa `e2e/playwright.notte.config.ts`: nessun server avviato, si apre il sito
  vero con due account di prova (segreti `NOTTE_CLIENT_EMAIL`,
  `NOTTE_PRO_EMAIL`, `NOTTE_PASSWORD`).
- `e2e/notte/percorso.spec.ts` (telefono, Chromium): il cliente manda una
  richiesta al professionista di prova, lui risponde con un preventivo da
  80-120 € con acconto del 30%, il cliente apre "Accetta il preventivo",
  sceglie la carta, controlla i 24,00 € e arriva alla pagina di Stripe. Non
  paga: senza pagamento non nasce un lavoro e la richiesta si può eliminare.
  La prova la elimina alla fine, e all'inizio toglie quelle rimaste da una
  notte interrotta (descrizione che inizia con "PROVA NOTTURNA").
- `e2e/notte/pagine.spec.ts` (motori di Safari e Firefox da computer): home,
  /per-professionisti, /prezzi, /faq, /accedi, Le mie richieste, Oggi, Agenda
  e Richieste si aprono senza errori del browser, senza uscire dallo schermo
  e senza rimandare all'accesso.

- **Anche dopo ogni aggiornamento del sito** (sì di Luca del 19/11, contro il
  mio consiglio di aspettare): lo stesso workflow parte quando Vercel segnala
  a GitHub che la versione nuova è pubblicata (`deployment_status` riuscito,
  ambiente Production; le anteprime no). Due giri non si accavallano
  (`concurrency`). Un aggiornamento della sola API su Render non manda avvisi
  a GitHub: lo copre il giro della notte.

**Motivo**: le 68 prove della CI girano su un database di prova, nessuna
guardava il sito pubblicato. Un guasto di configurazione (chiave di Stripe,
variabile su Render o Vercel, database rifatto) si vedeva solo provando a
mano. Il pagamento vero con la carta resta una prova a mano: il modulo della
carta di Stripe non si apre da un browser automatico fuori dalla nostra CI.

**Senza segreti** la prova fallisce apposta, come lo stream di Uptime
(`docs/ops/avvisi.md`): non si salta in silenzio.

**Verifica**: il percorso e le pagine provati dal contenitore contro il sito
vero con Chromium (1 + 3 prove verdi, richiesta eliminata alla fine,
controllato dall'elenco del cliente). WebKit e Firefox girano la prima volta
da Actions → Prova notturna → Run workflow, dopo l'unione.

## Primo giro su GitHub (19/11, pomeriggio)

Il primo giro a mano dopo l'unione è finito rosso per due motivi, tutti e due
della prova e non del sito:
- **Safari, pagine pubbliche**: il motore di Safari segna come errore le
  richieste dei dati interrotte quando la prova cambia pagina ("due to access
  control checks"). Ora la prova aspetta che la pagina abbia finito di
  chiedere i dati prima di passare alla successiva. Firefox e le aree con
  l'accesso erano già verdi.
- **Percorso**: "Professionista non trovato". Il professionista messo nel
  segreto `NOTTE_PRO_EMAIL` non ha il profilo pubblico. Con gli account
  "pagamenti" il percorso è verde da qui. La prova ora lo controlla prima e
  lo dice chiaro.

L'avvio dopo l'aggiornamento del sito funziona: Vercel ha fatto partire il
secondo giro da solo.
- **Giri annullati**: due giri lanciati a mano sono stati annullati da
  GitHub. La regola "un giro alla volta" stava in cima al workflow, e ogni
  avviso di Vercel (anche di un'anteprima, poi saltato) prendeva il posto del
  giro in attesa. Ora la regola sta sul lavoro: un avviso saltato non tocca
  niente.

## Safari rosso a giri alterni: la causa (19/11, pomeriggio)

Dopo la prima correzione Safari sulle pagine pubbliche era ancora rosso in un
giro su due. Causa trovata con un giro di diagnosi sul ramo: la barra in alto
chiede l'ordine dei mestieri "a pagina ferma" (`SiteHeader`,
`prefetchCategoryOrder`). Safari non ha `requestIdleCallback`, quindi la
richiesta parte 1,5 secondi dopo l'apertura: a volte dopo che la prova aveva
già visto la pagina ferma, e il passaggio alla pagina dopo la interrompeva. Il
motore di Safari lo segna come errore ("due to access control checks"); il sito
lo gestisce già (`loadPopularOrder` ha il suo `catch`) e succede a ogni
visitatore che cambia pagina in fretta. Non è un difetto del sito.

Ora ogni pagina si apre in una scheda sua e gli errori si contano finché la
pagina è aperta, non mentre la si chiude. Nel registro del giro restano
scritte le richieste non riuscite, le risposte con errore e gli errori
arrivati dopo l'uscita, per capire subito un prossimo rosso.

## Dopo il lancio e avviso di Firefox (19/11, sera)

Richiesta di Luca: sì alle due migliorie rimaste (righe in checklist per gli
account della prova, controllo dell'avviso di Firefox).

- **Account della prova dopo il lancio**: dal `LAUNCH_DATE` gli account di
  prova escono dai punti pubblici (`publicVisibilityWhere`), ma ricevono
  ancora le richieste dirette. La prova non controlla più il profilo pubblico
  del professionista: se il professionista non può ricevere richieste lo dice
  l'errore della richiesta stessa, con il nome del segreto da correggere.
- **Checklist di lancio, punto 45**: i due account `NOTTE_*` non si eliminano
  con gli altri account di prova (o si rifanno aggiornando i segreti). Con le
  chiavi Stripe vere il professionista di prova non ha un conto Stripe valido:
  quel giorno la prova va fermata ad "Accetta il preventivo".
- **Avviso di Firefox "blocked a JavaScript eval"**: viene da zod 4
  (`allowsEval` in `zod/v4/core/util.js`), che all'avvio prova `Function("")`
  dentro un `try/catch` per capire se può usare la strada veloce. La nostra
  CSP lo ferma, zod usa la strada normale. Nessun codice del sito usa `eval`:
  l'avviso è innocuo e la prova non lo conta. Si può far sparire con
  `z.config({ jitless: true })`: non fatto, da decidere con Luca.

Verifica: prova del percorso in locale contro il sito vero, 1 su 1.
