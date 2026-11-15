# Scelta della categoria: suggerita con "Cambia", pillole al posto delle tessere

**Richiesta** (Luca, 15/11/2026, thread "Modernizzare la scelta della
categoria"): "quelle tessere di scelta della categoria sono troppo antiquate,
fai valutare da un esperto una soluzione migliore". Tre proposte con anteprime
(A suggerita con "Cambia", B pillole, C ricerca + più richiesti); Luca ha
scelto la **A** con quattro migliorie: titolo "Chi ti serve", pillole anche
nella scelta dei mestieri del professionista, ricerca con le parole del
dizionario dei problemi, animazione leggera del pannello.

**Decisione**:
- Richiesta di preventivo (`CategoryChoice`): con una categoria già scelta
  (suggerita dalla descrizione o arrivata dal link) si vede solo lei, in una
  scheda con "Suggerita dalla tua descrizione" o "Suggerita dall'intelligenza
  artificiale: può sbagliare. Come funziona" (AI Act art. 50) e il pulsante
  **Cambia**. Gli altri mestieri proposti restano pulsanti "+ Fabbro" sotto
  la scheda (mai elenco misto, decisione del 09/11).
- **Cambia** apre un pannello: dal basso sul telefono, al centro sul computer
  (due colonne). Dentro: "Chi ti serve", "1 di 3 scelte", **Fatto**, una
  ricerca che trova il mestiere dal nome, dalle specializzazioni e dalle
  parole del dizionario dei problemi (`searchCategories` con `matchProblem`:
  "caldaia" → Climatizzazione e caldaie, "serrature" → Fabbro) e l'elenco con
  spunta, fino a 3. L'ordine si fissa all'apertura (§324): proposti, già
  scelti, poi i più cercati. Esc, clic fuori o Fatto chiudono e il fuoco torna
  su Cambia (`useDialogFocus`). Altezza fissa: cercando non si accorcia.
- Senza categoria (descrizione vuota o non capita, domanda aperta) restano
  tutte le categorie, ma a **pillole** con l'icona colorata invece delle
  tessere grandi: da telefono metà dello spazio. Chi comincia a scegliere
  dalle pillole resta sulle pillole, così la forma non cambia sotto il dito.
- Titolo "Chi ti serve" al posto di "Categorie".
- Le stesse pillole nella scelta dei mestieri del professionista
  (`CategoryMultiPicker`: registrazione, profilo, admin), sempre in ordine di
  iscritti, con "Principale" dentro la pillola. Tolte le tessere compatte a 3
  per riga e i nomi accorciati, che con le pillole non servono più.
- Animazioni: pannello che sale in 300 ms (cubic-bezier 0.32, 0.72, 0, 1),
  finestra del computer in 200 ms; tutte ferme con "riduci movimento".

**Contatore "categoria suggerita tenuta o cambiata"** (sì di Luca): c'era già.
Ogni richiesta salva `suggestedCategorySlug` e Admin → Mestieri richiesti
mostra tenute, tenute con altre aggiunte, cambiate e le sostituzioni più
frequenti, dal `LAUNCH_DATE` e senza account di prova (§395). Con il pannello
il valore inviato resta lo stesso (`autoApplied`), quindi il conteggio vale
come prima.

**Verifica**: `e2e/tests/richiesta-preventivo.spec.ts` (telefono e computer):
scheda suggerita, pannello con Pulizie aggiunta e fuoco di ritorno, ricerca
con "caldaia", "serrature" e nessun risultato, axe senza errori sul pannello,
Esc, pillole che restano pillole, categoria del link con "Aggiungi
Idraulico". Passano anche le prove di urgente, barra del preventivo,
conteggi, date, tastiera (axe su /registrati e /preventivo), prestazioni.
Foto prima e dopo in `anteprime/scelta-categoria/` del progetto.
