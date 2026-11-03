# Il sito è una piattaforma di intermediazione, con gli strumenti inclusi

**Richiesta** di Luca: "Il nostro sito può definirsi più un servizio o un
software?", poi il prompt riscritto (servizio, piattaforma o software; come
dirlo a clienti, professionisti, nei documenti legali e per il codice ATECO)
e infine "Effettua tutte le proposte".

**Analisi** (nella cartella del progetto, `analisi/definizione-servizio-o-software.md`):
il sito è una **piattaforma di intermediazione online**. I livelli
dell'abbonamento si distinguono per i lavori accettati, non per le funzioni:
il professionista paga l'accesso ai clienti. Agenda, preventivi, promemoria e
documenti sono **strumenti inclusi**. Per DSA, P2B, DAC7 e Codice del consumo
contano i fatti, e i fatti dicono piattaforma; chiamarlo "software" non
toglierebbe obblighi e ne aggiungerebbe altri. Il rischio da evitare è
diventare il fornitore del lavoro (Corte UE, Uber C-434/15) o una piattaforma
di lavoro digitale (direttiva UE 2024/2831, da recepire entro il 2/12/2026).
Domande 86-90 per avvocato e commercialista (ATECO 43.60 + 96.40, parole delle
fatture, direttiva sul lavoro, privati occasionali, responsabilità sugli
strumenti).

**Decisione** (tutte le proposte, ok di Luca del 03/11/2026):
- **Termini**: al punto 1 una frase sugli strumenti inclusi nell'abbonamento;
  al punto 4 "Il professionista accede al servizio di intermediazione e agli
  strumenti inclusi con un abbonamento a livelli". Nuova versione
  `2026-11-03` in `TERMS_CHANGES`, senza avviso (prima del lancio, come le
  altre).
- **Pagina per i professionisti**, sezione "Tutto quello che serve al tuo
  lavoro": "Tutto compreso nell'abbonamento, senza programmi a parte."
- **Fatture** (XML per lo SdI): una seconda riga di causale dice il servizio
  fatturato, `INVOICE_SERVICE_CAUSALE` in `packages/shared/src/accounting.ts`
  (commissioni, abbonamento, passaggio di livello, visibilità, sempre
  "servizio di intermediazione online"). Le righe e le etichette nelle pagine
  restano uguali. Parole da confermare col commercialista (domanda 87): se
  cambia, si cambia solo quella costante.
- **"Ce ne occupiamo noi"**: dopo l'invio "…e scegli tu a chi chiedere il
  preventivo", per dire che la scelta resta del cliente.
- **CLAUDE.md §5 punto 18**: il sito resta un intermediario (niente prezzi
  nostri, niente lavori assegnati d'ufficio, mai "i nostri professionisti").
- **Glossario** (`docs/glossario.md`): sezione "Che cos'è il sito".

**Verifica**: test della causale (dice "servizio di intermediazione online",
entro i 200 caratteri Latin-1 dello SdI), test delle versioni dei Termini,
typecheck e lint.

**Seguito** (Luca, "Sì entrambe", stesso giorno): la stessa frase nell'email
di benvenuto del professionista ("Agenda, preventivi, promemoria e documenti
sono compresi, senza programmi a parte."). Le parole delle fatture si
rivedono quando risponde il commercialista (domanda 87).

**Migliorie** (Luca, "Effettua tutte le migliorie"):
- **Note legali**, punto 1: il sito è una piattaforma di intermediazione
  online e il contratto per il lavoro si conclude tra cliente e
  professionista, prima dei dati della società.
- **Controllo dei testi** di email, notifiche e pagine: nessun "i nostri
  professionisti", "garantiamo il lavoro" o simili. "Garanzia" compare solo
  nei Termini (garanzie del pagamento online e garanzia di legge del
  professionista) e nella privacy (trasferimenti dei dati): va bene così.
- **Parole delle fatture**: restano in attesa della risposta del
  commercialista (domanda 87).
