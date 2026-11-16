# Account di prova realistici con uno script

**Richiesta** (Luca, 16/11/2026, thread "Creare account di prova realistici"):
"crea vari account di prova, sia professionisti che utenti con dati completi
che sembrano reali". Approvati anche: lo script non crea nulla dopo il
`LAUNCH_DATE`; pagamenti online e abbonamenti Stripe restano fuori (si provano
dal sito); il passo "togli gli account di prova" va nella checklist di lancio.

**Decisione**: uno script ripetibile, `apps/api/scripts/account-prova.mjs`,
invece di account fatti a mano. Entro il 5/12 il database gratuito di Render
va rifatto e gli account si ricreano con un comando; prima del lancio lo stesso
script li toglie tutti.

- `crea`: toglie quelli di prima e crea 8 professionisti (Milano, Torino,
  Bologna, Firenze, Roma, Napoli, Bari, Palermo; non Rieti, Viterbo e Ancona
  delle prove di carico) e 6 clienti. Professionisti con presentazione,
  prestazioni e prezzi, orari, copertina pronta, due foto nei "Lavori svolti"
  (le due copertine del mestiere, indirizzo da `FRONTEND_URL`; sì di Luca del 16/11), dati fiscali, verifica
  d'identità come da Didit di prova, 21 lavori passati con recensione (alcune
  con risposta) e numeri del profilo calcolati da quelli. Tipi diversi: ditta
  individuale, lavoro occasionale (Sara Galli), società (Ricci Decorazioni
  S.r.l.), uno in pausa (Napoli), uno appena iscritto senza dati fiscali né
  verifica (Palermo). Ogni cliente ha una storia in corso: richiesta in
  attesa, preventivo da accettare con chat, lavoro fissato, lavoro da
  confermare, data proposta dal cliente, richiesta urgente con un rifiuto.
- `togli`: elimina solo gli utenti con email `@prova.example.com` **e**
  segnati "Account di prova", con richieste, preventivi, lavori e recensioni.
- `elenco`: mostra cosa c'è.
- Tutto inventato: codice fiscale e partita IVA giusti solo nella forma
  (ufficio IVA 099), telefono con prefisso 300, niente foto di persone, niente
  IBAN né Stripe. Nessuna riga `TaxIdCheck`: niente chiamate (e costi) a
  Openapi. Il codice fiscale si salva in chiaro e l'API lo cifra al suo
  avvio successivo (`FiscalEncryptionMigrationService`, §292): lo script non
  deve conoscere `FISCAL_DATA_KEY`.
- Gli account sono segnati `testAccountAt`: fuori da ogni numero (CLAUDE.md §5
  punto 17) e, dal lancio, fuori dalla ricerca (`publicVisibilityWhere`).

**Come si usa**: la Shell di Render c'è solo con il piano a pagamento
(osservazione di Luca), quindi si lancia da GitHub con un pulsante:
`.github/workflows/account-prova.yml`, Actions → "Account di prova" → Run
workflow → `elenco`, `crea` o `togli`. Due segreti del repository, da
rimettere quando si rifà il database: `PROVA_DATABASE_URL` (External Database
URL di Render) e `PROVA_PASSWORD` (password uguale per tutti, mai stampata:
i registri del repo pubblico li vede chiunque). Facoltativa la variabile
`LAUNCH_DATE` di GitHub, che fa rifiutare `crea` dopo il lancio. A mano:
`DATABASE_URL=... node apps/api/scripts/account-prova.mjs crea` (senza
`PROVA_PASSWORD` ne genera una e la stampa). Checklist di lancio punto 45 per
toglierli.

**Verifica**: su un Postgres locale con tutte le migrazioni: `crea` due volte
di fila, `togli` lascia zero righe in users, bookings, guided_requests,
reviews e quotes; con `LAUNCH_DATE` passato `crea` si rifiuta. API e sito in
locale: ricerca "Idraulico a Milano" mostra Idraulica Ferri con 4,8 e 5
recensioni, il giardiniere in pausa non compare, profilo pubblico, "Le mie
richieste" del cliente, "Richieste e lavori" e "Recensioni" del professionista
si aprono senza errori con i dati attesi.
