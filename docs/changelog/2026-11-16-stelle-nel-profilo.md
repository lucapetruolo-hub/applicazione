# 16/11/2026 — Stelle salvate nel profilo, pagina ordinata dal database

**Richiesta di Luca.** Dopo la ricerca più leggera (`2026-11-16-ricerca-leggera.md`), sì alla
miglioria facoltativa: "salvare stelle e numero di recensioni direttamente nel profilo, così
il database può ordinare da solo e leggere solo i 20 della pagina". Il motivo, con le sue
parole: "dobbiamo essere pronti a tutti i numeri".

**Prima.** A ogni ricerca l'API leggeva tutti i trovati e contava le loro recensioni. Poi li
ordinava e ne teneva 20. Con migliaia di professionisti in una città voleva dire migliaia di
righe e decine di migliaia di recensioni contate per ogni pagina vista. Per la ricerca per
luogo l'API riceveva anche le coordinate di tutti i professionisti d'Italia.

**Decisioni.**
1. **Stelle e recensioni nel profilo**: colonne `reviewCount` e `reviewRating` di
   `professional_profiles`, migrazione `20261116180000_stelle_nel_profilo`.
   - **Chi le aggiorna**: un trigger del database, a ogni recensione nuova, cambiata
     (voto, nascosta, ripubblicata) o cancellata, e a ogni lavoro cancellato o passato a un
     altro professionista. Nessun percorso del codice può dimenticarlo, come per
     `bookings_set_guided_request_id`.
   - **Regole**: le stesse di `loadReviewStats`. Contano le recensioni non nascoste; la media
     si arrotonda a un decimale con gli stessi conti del sito (`floor(media * 10 + 0.5) / 10`).
     `round()` di Postgres arrotonda il mezzo al pari: 54 profili di prova su 3.000 avrebbero
     mostrato 0,1 stelle in meno.
   - **Professionisti già iscritti**: la migrazione riempie le colonne per tutti.
2. **Pagina ordinata dal database** (`searchPageInDatabase`).
   - **Quando**: ricerca per mestiere e luogo con i filtri del profilo (online, lingua,
     assicurazione, pagamenti online, specializzazione). Sono le pagine città, le più viste.
   - **Come**: si leggono solo gli id dei trovati. Poi il database ordina con gli stessi
     criteri di prima e restituisce i 20 della pagina. Conta anche il totale e calcola il
     riassunto "in breve", le città e le lingue.
   - **Ordine**: abbassati in fondo, poi chi deve verificare l'identità, poi il boost (non con
     `merito=1`), stelle, recensioni, distanza.
   - **A parità di tutto**: l'id, byte per byte (`COLLATE "C"`). Lo usa ora anche la ricerca
     nel codice, così le pagine non si scambiano i professionisti tra una richiesta e
     l'altra (prima a parità l'ordine poteva cambiare).
   - **Restano alla ricerca nel codice**, che ora legge stelle e recensioni dalle colonne
     invece di contarle: problema o prestazione cercati (la prestazione in evidenza si trova
     nel codice), zona della mappa, filtri sull'agenda ("Oggi", "Entro 3 giorni", "Urgente")
     e i puntini.
3. **Ricerca per luogo**: prima di misurare le distanze il database scarta chi sta fuori da un
   riquadro di 105 km intorno al comune (`searchAreaBox`). La ricerca non sceglie mai nessuno
   oltre i 100 km (`SEARCH_FALLBACK_MAX_KM`), quindi i risultati non cambiano.
4. **Query in parallelo**: totale, riassunto, pagina chiesta e prime prestazioni partono
   insieme; la scheda intera e l'agenda insieme alle prestazioni di "in breve".

**Verifica.**
- **Trigger**, provati sul database locale in una transazione annullata: recensione nascosta
  (29 → 28), voto cambiato (media da 4,1 a 4), lavoro cancellato (28). Riempimento: nessuna
  differenza dal conto dal vivo su 3.000 profili e 72.047 recensioni.
- **Risposte dell'API** identiche alla versione di prima, agenda esclusa, su 70 ricerche:
  - 60 a caso tra mestieri, città, filtri, merito e pagine, anche oltre l'ultima;
  - le 10 del confronto della ricerca leggera.
- **Prove** in `apps/api/src/professionals/professionals.service.test.ts`:
  - pagina, totale e riassunto dal database, scheda intera solo per la pagina;
  - lingua passata come parametro e mai scritta nel testo della query;
  - pagina oltre l'ultima e boost escluso con merito;
  - quali ricerche passano dal database.
- **Prova** in `search-area.test.ts`: il riquadro contiene ogni punto a 100 km, anche al nord.
  Suite dell'API 1585/1585.
- **Database locale con 12.000 professionisti** (circa 1.000 per città, 144.000 recensioni):
  - tutti i mestieri a Latina: da 0,32 a 0,09 s;
  - Roma pagina 30: da 0,32 a 0,09 s;
  - un mestiere in tutta Italia: da 0,17 a 0,08 s;
  - puntini: da 0,13 a 0,07 s.
- **Prova di carico** con la miscela con pagine e puntini, sullo stesso database: da 13 a 17
  visite servite al secondo su un processore. Il resto del tempo ora va in parti fisse: agenda
  delle 20 schede, scheda intera, visibilità pubblica del profilo.
