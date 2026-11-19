# Termini corretti sull'acconto e video su Cloudinary con un permesso per volta

**Richiesta** (Luca, 19/11/2026, thread "Rivedere i lavori di oggi da
esperto"): sì alle correzioni 1, 2 e 3 della revisione dei lavori del 18/11
(`analisi/revisione-lavori-18-11.md` nei file del progetto).

**Decisione**:
- **Termini, punto 5, acconto sul prezzo minimo**: una frase diceva ancora
  "percentuale dell'importo massimo del preventivo", resto della modifica del
  18/11 (`2026-11-18-importo-acconto.md`), mentre l'inizio dello stesso punto
  dice "prezzo minimo". Ora le due frasi dicono la stessa cosa.
- **Termini, punto 5, annullamento dentro il preavviso**: dicevano "se il
  lavoro viene annullato prima dell'esecuzione, l'acconto viene rimborsato per
  intero", senza eccezioni. Il sito invece tiene l'acconto al professionista
  se il cliente annulla dentro il preavviso e il preventivo lo prevede
  (`lateCancelKeepsDeposit`, decisioni dell'11-13/11). In una lite vale il testo
  più favorevole al consumatore: ora i Termini dicono l'eccezione, che il
  cliente vede prima di accettare, e rimandano allo spostamento chiesto dal
  professionista (PR #419), in cui l'acconto torna sempre.
- Una riga in più nella versione dei Termini del 19/11 (una sola versione
  insieme alla #419, prima del lancio senza avviso).
- **Video caricati direttamente su Cloudinary** (`2026-11-18-video-che-carica-ancora.md`):
  la firma valeva un'ora per quanti video si voleva. Ora:
  - la firma contiene un nome di file a caso e `overwrite=false`: vale per un
    solo video;
  - tetto al giorno per utente (20, `VIDEO_UPLOAD_USER_DAILY_LIMIT`) e per il
    sito (1500, `VIDEO_UPLOAD_DAILY_LIMIT`, avviso all'80% e al pieno), nel
    database come gli altri tetti;
  - lo stesso tetto vale per i video caricati dall'API (ripiego), così non si
    aggira; il sito, davanti al 429, non ripiega e mostra il messaggio.
  - Il peso massimo non si può imporre a Cloudinary con un caricamento firmato:
    resta il controllo del sito (50 MB) e il limite del piano Cloudinary;
    Cloudinary salva comunque solo la copia a 480p e al massimo 65 secondi.

**Verifica**: prove di `cloudinary-direct-video.test.ts` (firma con nome e
senza sovrascrittura, tetto per utente, tetto del sito), prove dell'API di
cloudinary/guided-requests/common, controllo di TypeScript, controllo di
`render.yaml`.

## Agenda: voci spente di "Mostra" ricordate (19/11/2026)

**Richiesta** (Luca, 19/11/2026): sì alla voce 12 della revisione.

**Decisione**: le voci spente di "Mostra" in Agenda restano spente anche
riaprendo la pagina, su questo browser (`localStorage`
"agenda-voci-nascoste"), come le tappe tolte del Giro intelligente (#406) e la
colonna nascosta. È sicuro da quando le voci spente si vedono sempre (#417:
"Nascosti", riga "Non stai vedendo" sopra il calendario anche da telefono, con
"Mostra tutto"). Valori rovinati o sconosciuti si ignorano: tutte accese.
