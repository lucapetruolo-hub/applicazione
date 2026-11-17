# Scegliere professionisti di due mestieri nella stessa ricerca

**Richiesta** (Luca, giro di prova del 17/11/2026): dopo la sezione "Può farlo
anche un falegname" sotto i risultati di "battiscopa staccato"
(`2026-11-17-ricerca-home-in-attesa.md`), scegliere con "Scegli" anche i
professionisti del secondo mestiere. Tra le strade proposte (A: una richiesta
per mestiere, ognuna ai suoi scelti; C: "Scegli" solo dentro "Vedi tutti")
Luca ha scelto la A ("si A").

**Decisione**:
- "Scegli" compare anche sulle schede della sezione del secondo mestiere. Chi è
  scelto lì porta con sé il mestiere della sezione (`requestCategory` in
  `useChosenPros.ts`), e il link della barra "Chiedi preventivo ai N scelti"
  aggiunge `altreCategorie`.
- Il modulo della richiesta ai scelti tiene le due categorie. All'invio parte
  **una richiesta per mestiere** (come la richiesta generale a più mestieri,
  docs/CHANGELOG.md §259), e ognuna arriva **solo ai suoi scelti**
  (`chosenByCategory` in `guided-requests.service.ts`: ognuno va sotto il primo
  mestiere che fa, principale o in più). Un professionista che non fa nessuno
  dei due mestieri o un mestiere senza scelti fermano l'invio con un messaggio
  chiaro.
- Se il cliente toglie con la X l'ultimo scelto di un mestiere, quel mestiere
  non parte più (il modulo manda solo i mestieri dei scelti rimasti); con un
  solo scelto rimasto diventa la richiesta diretta di sempre.
- Lo schema permette `extraCategorySlugs` insieme a `professionalProfileIds`
  (prima vietato); resta vietato con un solo professionista scelto e la fascia
  oraria resta solo per la richiesta diretta.
- Le richieste ai scelti restano fuori dallo smistamento: niente boost
  (CLAUDE.md §5 punto 14) e niente "Richieste generali" chiuse a bloccarle.
- Corretta di passaggio la barra in basso da computer: "2 scelti su 5" e i nomi
  andavano sulla stessa riga attaccati, ora sono su due righe.

**Perché**: il cliente non deve scegliere in anticipo il mestiere giusto
quando il lavoro lo fanno due mestieri; ogni professionista riceve una
richiesta del suo mestiere, come oggi, e i preventivi si confrontano insieme.

**Verifica**:
- Test API: `chosen-professionals.test.ts` (3 nuovi: divisione per mestiere
  anche con categoria in più, chi non fa nessuno dei mestieri, mestiere senza
  scelti), `guided-request-schema.test.ts` (mestieri in più con i scelti).
- Dal vivo in locale (dati finti, Milano, "battiscopa staccato"): scelti un
  muratore e un falegname, il modulo li mostra con il loro mestiere, l'invio
  crea due richieste (muratore → solo il muratore scelto, falegname → solo il
  falegname scelto). Foto in
  `collaudo/2026-11-17-giro-cliente-professionista/foto/` (`scelti-due-mestieri-*`,
  `richiesta-due-mestieri-*`).
