# Barra di attesa "sta cercando"

**Richiesta** (Luca, 05/11/2026): un esempio CSS di barra sottile con i
colori che scorrono e i bordi sfumati, "vedi dove si potrebbe inserire".
Dopo l'anteprima con tre punti proposti: "ok procedi con tutto quello che
ritieni".

**Decisione**:
- Una sola barra (`.flow-bar` in `globals.css`): 4 px, solo i verdi del sito
  (`#128552` → `#189A63` → `#7FD3A8`) che scorrono in 2 s, bordi sfumati con
  `mask-image`. I quattro colori dell'esempio sono quelli di Google Gemini e
  darebbero l'aspetto "fatto con l'IA" già scartato.
- Un solo stato per tutto il sito (`apps/web/src/lib/navigationProgress.ts`)
  e un solo componente in cima allo schermo (`NavigationProgress`, nel
  layout): barra di 3 px sopra la barra fissa del sito, più una frase sotto
  quando serve (letta anche dal lettore di schermo, `role="status"`).
- Compare solo dopo 300 ms (sulle pagine veloci non lampeggia) e si spegne
  quando arriva la pagina nuova, al ritorno con "Indietro" da Stripe, o dopo
  20 s se la pagina non arriva.
- Dove si accende:
  1. ricerca dal problema scritto dalla barra in alto, dai risultati e
     dalla pagina "non trovato": frase "Cerco chi ti serve…" (la stessa delle
     luci della home). Nella home no: lì ci sono già le luci che accelerano;
  2. ogni link interno del sito e le aperture del profilo dai risultati
     (`navigateWithTransition` con l'indirizzo di arrivo), senza frase;
  3. prima di andare a Stripe (acconto, saldo, accettazione con acconto,
     abbonamento, passaggio di livello, portale della carta, attivazione dei
     pagamenti e conto Stripe) e a Didit (verifica dell'identità del
     professionista e del legale rappresentante): "Ti portiamo al pagamento
     sicuro…" o "Ti portiamo alla pagina sicura…". Se la chiamata fallisce la
     barra si spegne e resta il messaggio d'errore di sempre.
- Dove no: invio delle foto (tre pallini), liste che si caricano (scheletro
  grigio), pulsanti piccoli (rotellina). Due segnali per la stessa cosa
  confondono.
- Animazioni ridotte: la regola globale ferma la barra; resta visibile, ferma,
  con la frase.

**Verifica**: `pnpm typecheck` e `pnpm lint` di `apps/web` verdi. Prova nel
browser con le risposte rallentate di 8 s: barra e "Cerco chi ti serve…"
dopo la ricerca dal problema (computer), barra in cima su un link (telefono);
foto in `anteprime/barra-di-attesa/` nei file del progetto.
