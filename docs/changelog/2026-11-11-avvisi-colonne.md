# Singoli avvisi a colonne: il testo va a capo, i pulsanti no

**Richiesta** (Luca, 11/11/2026, foto da iPhone di Notifiche > "Singoli
avvisi"): "Deve andare a capo il testo, no i pulsanti, valuta da alto
esperto". Con una descrizione lunga i pulsanti Sito/Email (e "Sempre attivo")
scendevano sotto il testo, quindi ogni riga li aveva in un punto diverso;
"Sempre attivo" era anche spostato a destra (gli si applicava il margine di
60 px pensato per l'intestazione dell'argomento).

**Decisione**: la lista dei singoli avvisi diventa una tabella a due colonne,
come le impostazioni delle notifiche di iOS e Android. I nomi "Sito" ed
"Email" sono scritti una volta sola in alto; ogni riga ha a destra un cerchio
per canale (verde con la spunta = acceso, vuoto = spento), area di tocco
44 × 44 px, in colonne di larghezza fissa. Il testo prende lo spazio che
resta e va a capo. "Sempre attivo" (con il lucchetto) sta centrato sulle due
colonne; su telefono si legge solo "Sempre" (miglioria scelta da Luca, così
il testo ha più spazio), il lettore di schermo legge comunque "Sempre
attivo". Un avviso che non ha un canale (per esempio i promemoria del
professionista, solo sul sito) mostra un trattino grigio in quella colonna,
così le righe restano allineate. I pulsanti grandi Sito/Email dell'argomento
restano come prima. Stesso disegno su telefono e computer.

**Motivo**: con i pulsanti con la scritta, su un telefono da 320 px al testo
restavano meno di 100 px; con le colonne ne restano circa il doppio e i
pulsanti stanno sempre nello stesso punto. Per il lettore di schermo ogni
cerchio ha ancora il nome completo ("Promemoria: Email") e lo stato
premuto/non premuto.

**Verifica**: foto prima/dopo con iPhone 13, telefono da 320 px e computer
(cartella del progetto `anteprime/avvisi-colonne/`); lint e controllo dei
tipi di `apps/web`. La prova `promemoria-manutenzione.spec.ts` conta ancora i
pulsanti del gruppo per nome: invariata.
