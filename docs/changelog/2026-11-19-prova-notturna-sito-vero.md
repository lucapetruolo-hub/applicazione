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
