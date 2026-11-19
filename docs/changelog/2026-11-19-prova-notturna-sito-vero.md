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
