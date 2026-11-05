# Iscrizione dei professionisti: colonna unica, prestazioni per mestiere, Partita IVA

**Richieste** (Luca, 05/11/2026):
1. "Nella registrazione dal sito del professionista non mi piace la schermata divisa, valuta le migliorie."
2. "Nelle prestazioni offerte in fase di registrazione dividile per la categoria che si è scelto in precedenza, così non si crea caos."
3. "Nella sezione Partita IVA non dargli suggerimenti di inserimento, ma digli solo se è corretta o meno."
4. "Dove c'è scritto «Con Partita IVA» dagli la possibilità di modificarlo."

Proposte con foto in `anteprime/registrazione-schermata-divisa/` (cartella del
progetto): A colonna unica, B vantaggi sopra al passo 1, C foto in testa alla
scheda. **Luca ha scelto A.**

**Decisioni**:

1. **Colonna unica anche sul computer**: tolte foto e vantaggi accanto alla
   scheda (`ProfessionalSignupLayout`), scheda larga 560 px invece di 480, così
   le tessere dei mestieri respirano. Tolta la foto `registrati-elettricista.webp`,
   non più usata. Sul telefono non cambia nulla (era già una colonna).
2. **Prestazioni divise per mestiere** nel profilo (`/dashboard/profilo`, anche
   il primo dopo l'iscrizione): con più mestieri un riquadro per ognuno, con
   icona e colore del mestiere, le prestazioni aggiunte, "Le più richieste" di
   quel mestiere (4 in vista più "Altre") e "+ Scrivi un'altra prestazione".
   Con un solo mestiere resta una lista senza riquadro. "Consulenza online" va
   col mestiere principale.
   - Nuovo campo `ProfessionalService.categorySlug` (migrazione
     `20261105110000_service_category_slug`): il server lo salva solo se è un
     mestiere del profilo. Le prestazioni di prima (senza mestiere) vanno nel
     mestiere che le suggerisce, altrimenti nel principale, e al primo
     salvataggio prendono il mestiere.
   - Sul telefono unità, prezzi e "X" stanno su una riga sola sotto al nome
     (prima andavano a capo su tre righe), classi `service-*` in `globals.css`.
3. **Partita IVA**: mentre si scrive nessuna indicazione ("ne hai scritte 5",
   "solo numeri"). Il giudizio arriva a 11 cifre o uscendo dal campo: "Partita
   IVA corretta" in verde con la spunta (nuova prop `success` di `Field`) oppure
   "La partita IVA non è corretta." in rosso. Finché è a metà conta come
   mancante ("Manca: Partita IVA"), non come errore. I controlli del server non
   cambiano.
4. **Tipo modificabile in Dati fiscali**: accanto a "Con Partita IVA" (o
   Privato, Azienda) c'è "Cambia", che riapre le tre scelte. Come per "Cambia
   tipo" dell'admin, non dopo aver collegato Stripe: il pulsante non c'è e il
   server rifiuta il cambio (`entity-type-change.test.ts`). Il cambio del tipo
   toglie il "Verificato" come già prima (persona cambiata). Il testo della
   registrazione "Puoi cambiarlo dopo da Dati fiscali" ora è vero. Icone del
   tipo uguali a quelle della registrazione.

**Verifica**: `pnpm typecheck` e `pnpm lint` di `apps/web`, `tsc` e test di
`apps/api` (professional-fiscal, professionals); sito (build di produzione) e
API in locale con un database vuoto: iscrizione con due mestieri, prestazioni
aggiunte nei due riquadri, salvataggio con il mestiere (un mestiere non del
profilo torna `null`), Partita IVA a metà, sbagliata e giusta, "Cambia" del
tipo. Foto a 1440 px e iPhone 13 in `anteprime/registrazione-schermata-divisa/dopo/`.

## Migliorie 2 e 3 (scelte da Luca lo stesso giorno)

5. **Passando a "Privato" si cancellano i dati della ditta**: Partita IVA,
   numero REA e "IVA nelle fatture" del tipo di prima diventano vuoti nel
   database e non entrano nei controlli (formato, Partita IVA già usata da un
   altro account). Lo fa il server, qualunque cosa mandi il sito (test in
   `entity-type-change.test.ts`).
6. **Profilo pubblico con le prestazioni divise per mestiere** quando i
   mestieri sono più d'uno: sopra ogni gruppo l'icona e il nome del mestiere.
   Il mestiere di una prestazione lo decide `serviceCategoryOf` in
   `packages/shared/src/serviceNames.ts`, lo stesso usato nel profilo in
   dashboard (le prestazioni salvate prima vanno nel mestiere che le
   suggerisce, altrimenti nel principale).

**Verifica**: test dell'API, typecheck e lint del sito; in locale passaggio da
"Con Partita IVA" a "Privato" con Partita IVA e IVA salvate (tornano vuote) e
anteprima del profilo pubblico con due mestieri e prestazioni vecchie senza
mestiere. Foto in `anteprime/registrazione-schermata-divisa/dopo/6-profilo-pubblico-*.png`.

## Risultati di ricerca (Luca: "mostrarle per prime nei risultati di ricerca")

7. Cercando un mestiere, nella scheda del professionista con più mestieri le
   prestazioni di quel mestiere vengono per prime, poi le altre (stesso ordine
   dentro i due gruppi). Lo fa l'API (`servicesFirstFor` in
   `professionals.service.ts`, con test), così vale per sito e app.
8. **"da X €" della scheda chiusa sul mestiere cercato** (miglioria scelta da
   Luca): l'API dice quante prestazioni in cima sono di quel mestiere
   (`categoryServiceCount`) e la scheda (`priceFromFirst` di
   `ProfessionalCard`) calcola il prezzo più basso solo su quelle. Se nessuna
   ha un prezzo, resta il più basso fra tutte.

## Ordine dei mestieri sul profilo (Luca: "effettua anche questo")

9. Prima si sceglieva solo la principale e le altre seguivano l'ordine del
   sito (la tabella di collegamento non ricorda l'ordine). Ora in
   registrazione, in Dashboard → Profilo e in Admin (`CategoryMultiPicker`)
   "Ordine sul tuo profilo" elenca i mestieri numerati con le frecce su e giù
   (40 px, con nome per i lettori di schermo); il primo è la principale.
   L'ordine si salva in `ProfessionalProfile.categoryOrder` (migrazione
   `20261105180000_category_order`) e `profileCategories` lo usa per profilo
   pubblico, ricerca e salvati; i profili salvati prima restano nell'ordine
   del sito. Provato in locale: Elettricista, Fabbro, Idraulico salvato e
   restituito così dal profilo pubblico.
