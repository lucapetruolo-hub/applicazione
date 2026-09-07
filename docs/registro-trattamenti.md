# Registro delle attività di trattamento (art. 30 GDPR)

> Documento interno, non pubblico — non collegato da nessuna pagina del
> sito. Redatto seguendo il piano d'azione del "Verbale di Conformità"
> (audit legale/privacy della piattaforma). Descrive i trattamenti di dati
> personali effettuati da Professionisti così come risultano dal codice
> reale a oggi (settembre 2026), non un modello generico: va aggiornato
> ogni volta che cambia un trattamento, un fornitore terzo, o quando
> vengono attivati Stripe/Resend/Twilio (oggi non ancora configurati in
> produzione, vedi CLAUDE.md §9).
>
> **Titolare del trattamento**: [DA COMPILARE: ragione sociale, sede
> legale, P.IVA] — stesso segnaposto già presente in `/privacy`, da
> completare quando disponibili i dati societari reali.

---

## 1. Registrazione e gestione dell'account

- **Finalità**: creare e gestire l'account utente (cliente o
  professionista), autenticazione, sicurezza dell'accesso.
- **Base giuridica**: esecuzione di un contratto (art. 6.1.b GDPR) — i
  Termini di Servizio accettati alla registrazione.
- **Interessati**: chiunque si registri come cliente o professionista.
- **Categorie di dati**: nome, cognome, email, password (hash bcrypt, mai
  in chiaro), telefono (facoltativo), data di nascita (facoltativa),
  identificativo Google (solo per chi usa "Accedi con Google"), indirizzo
  IP e user agent nei log applicativi standard, data/versione del consenso
  a Termini/Privacy (`User.legalConsentAt`/`legalConsentVersion`).
- **Origine**: fornita direttamente dall'interessato al momento della
  registrazione (`apps/api/src/auth/`).
- **Destinatari esterni**: Google (solo per il flusso "Accedi con
  Google": verifica del token OAuth, nessun dato aggiuntivo condiviso
  oltre a quanto Google stesso raccoglie per il proprio servizio di
  accesso).
- **Conservazione**: per tutta la durata dell'account. Alla cancellazione
  richiesta dall'utente (`DELETE /auth/me`), l'account professionista
  viene rimosso definitivamente (cascata su profilo, prenotazioni non
  ancora concluse, ecc.); l'account cliente è invece reso anonimo
  (soft-delete, `User.deletedAt`, email sostituita con un valore
  sintetico, telefono/nome/data di nascita azzerati) mentre restano le
  righe collegate a prenotazioni/recensioni già concluse, per non
  cancellare lo storico che riguarda anche il professionista (vedi §5).
- **Misure di sicurezza**: password mai salvata in chiaro (bcrypt), JWT
  con scadenza, endpoint di autenticazione soggetti a rate limiting
  (`@nestjs/throttler`, 5-10 richieste/minuto) contro credential
  stuffing/enumerazione account.

## 2. Profilo pubblico del professionista e ricerca

- **Finalità**: mostrare il professionista nei risultati di ricerca
  (categoria + città) e sulla sua pagina profilo pubblica; posizionarlo
  sulla mappa dei risultati.
- **Base giuridica**: esecuzione di un contratto (il professionista crea
  volontariamente il proprio profilo per essere trovato dai clienti).
- **Interessati**: utenti con ruolo professionista.
- **Categorie di dati**: nome attività, categoria/sotto-categorie, città
  (comune ISTAT) e coordinate geografiche derivate, indirizzo preciso
  facoltativo (usato solo per la geocodifica interna, **mai mostrato
  pubblicamente** — vedi CLAUDE.md §10 "Fase 5"), bio, immagine profilo,
  prestazioni offerte con prezzi, lingue parlate, foto/video del
  portfolio, agenda di disponibilità.
- **Destinatari esterni**: chiunque visiti il sito (dato per sua natura
  pubblico, essendo un profilo professionale destinato alla ricerca);
  **Nominatim/OpenStreetMap** riceve l'indirizzo testuale al solo scopo di
  ottenerne le coordinate (nessuna chiave API, nessun account, richiesta
  identificata da uno User-Agent con email di contatto — vedi
  `apps/api/src/geocoding/geocoding.service.ts`); **Cloudinary** ospita le
  immagini/i video caricati (foto profilo, portfolio).
- **Conservazione**: fino alla cancellazione del profilo/account da parte
  del professionista.
- **Nota**: l'indirizzo preciso del professionista **non è mai esposto
  pubblicamente** (rimosso dalla resa pubblica in un giro di redesign
  precedente, CLAUDE.md §10) — resta nel database solo per la
  geolocalizzazione sulla mappa.

## 3. Richiesta guidata di preventivo (fan-out lead)

- **Finalità**: mettere in contatto un cliente con uno o più professionisti
  compatibili per categoria, zona e disponibilità; consentire lo scambio
  di un preventivo strutturato.
- **Base giuridica**: esecuzione di un contratto (richiesta esplicita del
  cliente) per l'invio al/ai professionisti selezionati; legittimo
  interesse del gestore della piattaforma per la selezione automatica dei
  professionisti da contattare (fan-out intelligente, CLAUDE.md §14).
- **Interessati**: clienti che inviano una richiesta; professionisti che
  la ricevono.
- **Categorie di dati**: descrizione del lavoro, foto/video allegati,
  città (facoltativa per le richieste online), e — **solo per un
  intervento a domicilio** — nome, cognome, telefono, indirizzo completo
  del destinatario dell'intervento (raccolti alla richiesta, non
  necessariamente coincidenti con l'account: "un cliente può avere lavori
  in indirizzi diversi da una richiesta all'altra").
- **Destinatari**: il/i professionista/i selezionati dal fan-out (mai
  tutti i professionisti della piattaforma, vedi CLAUDE.md §14) —
  **telefono/email/indirizzo del cliente restano nascosti al
  professionista fino all'accettazione del lavoro** (CLAUDE.md, sezione
  "Correzione — contatto cliente...", ribaltata più volte nel tempo,
  stato attuale: visibili solo dopo la conferma dell'appuntamento).
- **Conservazione**: la richiesta e i preventivi collegati restano nel
  database anche dopo la chiusura (scadenza, annullamento, completamento)
  per la cronologia condivisa cliente↔professionista (`ConversationEvent`,
  CLAUDE.md §21) e per le metriche di affidabilità del professionista
  (§15) — nessuna cancellazione automatica programmata oggi.

## 4. Prenotazione e completamento del lavoro

- **Finalità**: gestire l'appuntamento accettato, il relativo importo
  concordato/finale, la conferma reciproca di completamento.
- **Base giuridica**: esecuzione di un contratto.
- **Interessati**: cliente e professionista coinvolti nella prenotazione.
- **Categorie di dati**: data/ora dell'intervento, indirizzo di lavoro
  strutturato, voci di preventivo e importo finale, foto/video del lavoro
  svolto (caricate da entrambe le parti), note private del professionista
  (mai visibili al cliente), eventuale segnalazione di mancata
  presentazione.
- **Destinatari esterni**: **Cloudinary** per le foto/video del lavoro
  completato.
- **Conservazione**: nessuna cancellazione automatica — lo storico resta
  per la cronologia condivisa e per l'eventuale contestazione tra le
  parti.

## 5. Recensioni (bilaterali, "doppio cieco")

- **Finalità**: costruire un sistema di reputazione affidabile —
  recensioni consentite solo a valle di una prenotazione realmente
  confermata da entrambe le parti (CLAUDE.md §40).
- **Base giuridica**: esecuzione di un contratto/legittimo interesse
  (garantire l'affidabilità del sistema reputazionale, elemento
  centrale del modello di business, CLAUDE.md §1).
- **Interessati**: cliente (recensito dal professionista) e professionista
  (recensito dal cliente).
- **Categorie di dati**: voto, commento testuale, foto/video allegati.
- **Destinatari**: la recensione del professionista è pubblica (visibile
  sul suo profilo, solo dopo che esiste anche la recensione della
  controparte); la recensione sul cliente è visibile **solo al
  professionista stesso** che l'ha ricevuta (il cliente non ha un profilo
  pubblico in questo marketplace).
- **Conservazione**: nessuna cancellazione automatica; una recensione
  collegata a un account cliente cancellato resta visibile (traccia dello
  storico), l'identità del cliente viene invece anonimizzata (vedi §1).

## 6. Notifiche in-app

- **Finalità**: informare l'utente di aggiornamenti rilevanti (nuova
  richiesta, nuovo preventivo, cambio data, lavoro completato, nuovo
  messaggio in chat).
- **Base giuridica**: esecuzione di un contratto.
- **Interessati**: utenti registrati.
- **Categorie di dati**: tipo di evento, riferimento all'oggetto collegato
  (richiesta/preventivo/prenotazione), timestamp, stato di lettura.
- **Destinatari esterni**: nessuno — canale interno alla piattaforma
  (`Notification`, polling lato client). Nessun invio push/email/SMS reale
  attivo oggi (Expo Push/Resend/Twilio restano nello stack approvato ma
  non ancora integrati, CLAUDE.md §9).
- **Conservazione**: nessuna cancellazione automatica.

## 7. Lista d'attesa marketing ("Arriviamo presto nella tua zona")

- **Finalità**: raccogliere l'interesse di potenziali clienti in zone
  ancora poco coperte da professionisti reali, per un eventuale contatto
  futuro.
- **Base giuridica**: consenso (l'utente inserisce volontariamente la
  propria email in un modulo dedicato, nessun account necessario).
- **Interessati**: chiunque compili il modulo.
- **Categorie di dati**: solo indirizzo email.
- **Destinatari esterni**: nessuno oggi (nessun invio email automatico
  ancora attivo).
- **Conservazione**: fino a cancellazione manuale (nessuna scadenza
  automatica) — visibile solo agli amministratori (`GET /admin/waitlist`).

## 8. Segnalazione di contenuti (notice-and-action)

- **Finalità**: permettere a un utente autenticato di segnalare un
  contenuto problematico (profilo, recensione), per la moderazione da
  parte degli amministratori — meccanismo richiesto dal Digital Services
  Act (Reg. (UE) 2022/2065, art. 16).
- **Base giuridica**: legittimo interesse (sicurezza e affidabilità della
  piattaforma).
- **Interessati**: chi segnala (`reporterId`, obbligatorio: il canale
  richiede login) e, indirettamente, il contenuto/profilo segnalato.
- **Categorie di dati**: motivo della segnalazione, dettagli facoltativi,
  identificativo di chi segnala (mai mostrato al segnalato).
- **Destinatari**: solo gli amministratori della piattaforma
  (`GET /admin/reports`).
- **Conservazione**: nessuna cancellazione automatica (storico delle
  decisioni di moderazione).

## 9. Amministrazione e promozione ad admin

- **Finalità**: gestione interna della piattaforma (elenco utenti,
  moderazione, lista d'attesa).
- **Base giuridica**: legittimo interesse del titolare.
- **Interessati**: tutti gli utenti registrati (visibili in forma
  aggregata agli amministratori).
- **Misure di sicurezza**: accesso protetto da `AdminGuard` (verifica il
  ruolo `ADMIN` letto dal database ad ogni richiesta, mai dal solo JWT);
  la promozione del primissimo admin è protetta da un codice segreto solo
  in variabile d'ambiente (`ADMIN_BOOTSTRAP_SECRET`), mai committato.

## 10. Diritto di accesso e portabilità (art. 15/20 GDPR)

- **Meccanismo**: `GET /auth/me/export` (`AuthService.exportMyData`)
  restituisce all'utente autenticato l'esportazione strutturata (JSON) di
  tutti i propri dati — profilo, richieste/prenotazioni proprie,
  recensioni scritte/ricevute — accessibile da `/account` ("Esporta i miei
  dati"). Esclude esplicitamente dati che appartengono solo alla
  controparte (es. le note private del professionista non compaiono
  nell'esportazione del cliente).

---

## Elenco dei responsabili del trattamento (fornitori terzi, art. 28 GDPR)

| Fornitore | Ruolo | Dati coinvolti | Accordo (DPA) |
|---|---|---|---|
| **Cloudinary** | Hosting immagini/video (foto profilo, portfolio, foto richieste/recensioni/lavori) | File multimediali caricati dagli utenti | [DA VERIFICARE: accettazione dei termini/DPA standard di Cloudinary sull'account usato] |
| **Google** (Identity Services) | Autenticazione "Accedi con Google" | Token OAuth, email/nome associati all'account Google dell'utente | Regolato dai Termini di servizio di Google Cloud/Identity, non un DPA su misura |
| **Render** | Hosting backend (`apps/api`) e database Postgres | Tutti i dati applicativi (l'intero database) | [DA VERIFICARE: DPA standard di Render] |
| **Vercel** | Hosting frontend (`apps/web`) | Nessun dato applicativo persistito (solo richieste HTTP in transito/log infrastrutturali standard) | [DA VERIFICARE: DPA standard di Vercel] |
| **Nominatim / OpenStreetMap** | Geocodifica dell'indirizzo del professionista | Indirizzo testuale inviato per la sola geocodifica, nessun dato salvato lato loro oltre ai log standard del servizio pubblico | Servizio pubblico gratuito, nessun DPA — uso conforme alla loro Usage Policy (User-Agent identificativo, nessuna richiesta in un percorso di ricerca ad alto volume) |
| **Stripe** | Pagamenti (abbonamenti SaaS, boost, lead) | **Non ancora attivo** — nessuna chiave reale configurata in produzione (CLAUDE.md §9) | Da stipulare/verificare prima dell'attivazione |
| **Resend / Twilio** | Email/SMS transazionali | **Non ancora integrati** nel codice (CLAUDE.md §9, §14) | Da valutare quando introdotti |

Nota: questa tabella va aggiornata a ogni cambio di fornitore o
all'attivazione di uno dei servizi non ancora live (Stripe, Resend,
Twilio) — è la stessa lista di "Da fare prima del lancio" già tracciata in
CLAUDE.md §9, qui vista dal lato obblighi di trasparenza sui responsabili
del trattamento invece che dal lato tecnico/di configurazione.
