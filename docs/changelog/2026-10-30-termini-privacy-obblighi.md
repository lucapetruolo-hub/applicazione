# Termini, privacy e obblighi di legge (gruppo 7 del collaudo)

**Richiesta**: Luca, 30/10/2026: "Fai tutti i gruppi di correzione nelle
modalità che ritieni". Gruppo 7 del collaudo del 29/10/2026
(`collaudo/2026-10-29/agente-M.md`, difetti M-02…M-15), con le 9 domande
nuove per l'avvocato.

**Decisione e cosa cambia**:
- **Termini** (M-04, M-05, M-02): il punto "Modifiche" non dice più "l'uso
  continuato vale come accettazione": avviso per email e sul sito almeno 15
  giorni prima, chiusura dell'account senza costi se non si è d'accordo
  (Reg. UE 2019/1150 art. 3; Codice del consumo art. 33). Nuovo punto 10
  "Per i professionisti" (P2B artt. 3, 4, 5, 7, 9, 11): ordine dei
  risultati con tutti i criteri reali, chi compare nella ricerca,
  trattamenti diversi (pacchetto di visibilità, lavori del livello, limite
  di 2.000 € online per i nuovi), sospensione motivata per email e chiusura
  con 30 giorni di preavviso, dati a cui il professionista accede, reclami.
  Nuovo punto 11 "Diritto di recesso dei clienti" in bozza per l'avvocato
  (domande 42 e 72): la riga nella scheda del preventivo la fa il gruppo 3.
  Il punto 2 dice che la sospensione arriva con il motivo per email (lo fa
  già `ACCOUNT_SUSPENDED`).
- **Privacy** (M-06): intelligenza artificiale per proporre il mestiere
  (Anthropic, OpenRouter e il modello gratuito che può riusare i testi),
  Agenzia delle Entrate per la DAC7 e Openapi per lo SdI tra i destinatari,
  lettura delle richieste "Ce ne occupiamo noi", revoca del consenso in
  generale, risposta entro un mese, "Esporta i tuoi dati", avviso sui
  bambini nelle richieste di Babysitter, tempi di conservazione voce per
  voce (presi dal codice: 90 giorni per le richieste eliminate, 1 anno per
  le descrizioni del problema, 25 mesi per i conteggi; 10 anni per DAC7 e
  documenti contabili).
- **Dati della società in un solo punto** (M-01, M-10): `COMPANY` in
  `packages/shared/src/brand.ts`, letto da Privacy, Contatti, la nuova
  pagina `/note-legali` (gestore, contatti, punto di contatto DSA artt.
  11-12 con le lingue) e dal piede del sito, che mostra ragione sociale e
  P.IVA solo quando sono compilati (`companyDataReady`). I dati veri restano
  da mettere al lancio (checklist di lancio, punto 1).
- **Contatti** (M-09, M-10): email di assistenza visibile e "in italiano o
  in inglese"; la segnalazione di un contenuto illegale chiede in campi a
  sé nome e cognome e indirizzo della pagina (DSA art. 16 c. 2), salvati nel
  messaggio letto in Admin.
- **Ordine dei risultati** (M-08): il difetto era vero. La lista ordinava i
  professionisti visibili con l'ordine della ricerca senza città (quella
  che alimenta i puntini della mappa), che non conosce le distanze: a
  parità di stelle e recensioni non veniva prima il più vicino, e l'ordine
  dei profili senza recensioni era quello del database (da qui l'impressione
  che i "Verificato" venissero prima). Ora vale l'ordine della ricerca per
  città, poi gli altri visibili sulla mappa (`ResultsListWithMap`).
- **Intelligenza artificiale** (M-11): sotto "Ti serve…" la riga piccola
  "Proposta automatica: controlla che sia il mestiere giusto" con il link
  alla privacy, solo quando la proposta viene dall'intelligenza artificiale.
  L'avviso "acqua e corrente" ora scatta anche con "piove", "pioggia",
  "umido", "gocciola" e con "presa" al singolare (prima la regola trovava
  solo "prese"): la frase del collaudo propone l'elettricista con l'avviso.
- **Accessibilità** (M-12): tolto il "100/100", come verifichiamo, data
  dell'ultima verifica, limiti trovati dal collaudo con la tastiera, email
  di assistenza. Quando il gruppo 6 li corregge va aggiornato il punto 3.
- **Cookie** (M-13): elenco con nome, scopo e durata di ogni cookie e voce
  dell'archiviazione del browser; Cloudinary e l'indirizzo IP; "Preferenze
  cookie" e "Note legali" anche nel piede corto delle aree riservate.
- **"Risponde subito"** (M-14, seconda metà): il tempo di risposta compare
  sul profilo pubblico solo dopo 3 risposte misurate.

**Lasciati di proposito**:
- M-03 (S.R.L. come "Privato") e M-07 (consenso al volto per le società):
  gruppo 8 "Iscrizione e verifica dei professionisti".
- M-02 nella scheda del preventivo (chi esegue il lavoro, recesso): gruppo
  3, che tocca le stesse schede del gruppo 1.
- M-14 "Identità verificata da Stripe" e M-15 data di nascita del cliente:
  toccano decisioni già prese da Luca, proposte a lui.

**Domande per l'avvocato**: 72-80 in
`analisi/domande-commercialista-avvocato.md` (N-01…N-09 dell'agente M).

**Verifica**: typecheck di `apps/web` e `apps/api`, lint, test di `apps/api`
(1030) e di `packages/shared` (banco di prova del problema invariato, più il
caso del collaudo); pagine legali, contatti e note legali fotografate da
telefono e computer senza scorrimento di lato
(`collaudo/2026-10-29/gruppo7/`).
