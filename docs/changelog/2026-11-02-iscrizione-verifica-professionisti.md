# Iscrizione e verifica dei professionisti (collaudo 29/10, gruppo 8)

**Richiesta**: correggere i difetti del gruppo 8 del collaudo del 29/10
(`collaudo/2026-10-29/riepilogo.md`), più M-07 passato dal gruppo 7. Ogni
difetto è stato ricontrollato sul codice prima di toccarlo.

## Richieste ai professionisti non ancora pronti (0-01, C-13, E-09)

- **0-01**: un profilo appena creato riceveva subito le richieste aperte
  (anche urgenti) prima di essere visibile. `matchNewProfileToOpenRequests`
  ora controlla prima che il profilo riceva davvero richieste (non eliminato,
  sospeso, in pausa, in attesa d'invito, bloccato, con i dati fiscali quando
  servono: `publicVisibilityMissing`). Quando il profilo diventa visibile
  salvando i dati fiscali, `matchWhenVisible` gli manda le richieste aperte
  della sua zona.
- **C-13 / E-09**: un professionista senza verifica d'identità compariva
  primo nella ricerca. **Decisione**: non nasconderlo, perché la decisione
  §253 dice che la verifica d'identità non serve per comparire in ricerca;
  i profili che non possono ancora mandare preventivi vanno **in fondo** ai
  risultati, dopo gli altri. Nel profilo la scritta dice "Non puoi ancora
  rispondere: finché non verifichi l'identità, nella ricerca compari dopo
  gli altri".

## Dati fiscali (0-02, 0-03, 0-04, 0-06, E-05, E-06, E-07, D-12, C-17, D-13, E-12)

- **Messaggi chiari** (C-17, D-13, E-12, E-07, D-12): `codiceFiscaleProblem` e
  `partitaIvaProblem` dicono cosa non va ("ne mancano 2", "solo lettere e
  numeri", "c'è un errore di battitura: ricopialo dalla tessera sanitaria"),
  e il controllo con nome, cognome e data dice quale dato non corrisponde.
  Stessa frase, corretta, per il legale rappresentante.
- **Partita IVA con "IT"** (E-07, D-12): `normalizePartitaIva` toglie "IT",
  spazi, punti e trattini; si salvano le sole 11 cifre.
- **Numero REA** (E-05): `normalizeReaNumber` lo scrive come "LT-123456",
  `reaNumberProblem` controlla forma e sigla della provincia (107 province
  più le sigle storiche CI, OG, OT, VS). Errore in tempo reale nel campo.
- **Riepilogo** (E-06): dopo il salvataggio si vedono REA e legale
  rappresentante.
- **"Verificati"** (0-02): il bollino compare solo se tutti i controlli sono
  validi. La P.IVA inventata vista "Verificati" veniva quasi certamente dalla
  modalità di prova del fornitore: **da ricontrollare con le chiavi vere**.
- **Indirizzo di residenza** (0-03): i suggerimenti partono dalla città
  della sede o del profilo.
- **Dati persi ricaricando** (0-04): la parte 1 resta in una bozza nella
  scheda del browser (`sessionStorage`, mai sul disco e mai dopo la chiusura
  della scheda, perché sono dati fiscali; codici fiscali, data e luogo di
  nascita restano fuori e vanno riscritti, segnalazione di CodeQL), con "Abbiamo ripreso i dati che
  avevi scritto." e "Ricomincia". Si cancella al salvataggio.
- **Salvataggio lento** (0-06): mentre si controlla, una riga dice "Stiamo
  controllando ...: pochi secondi.".

## Suggerimenti degli indirizzi (0-09, C-20)

`GET /address/suggestions` capisce il comune scritto dopo il civico o dopo una
virgola, chiede a Google solo i risultati entro 15 km da lì (30 km dalla
città del profilo se il comune non è scritto) con la distanza, e mette prima
il comune scritto, poi i più vicini. Con meno di 2 risultati riprova con la
sola preferenza di zona. "Via Roma 10 Latina" non propone più prima Cisterna
di Latina, "Via Isonzo 30" dal profilo di Latina resta a Latina.

## Raggio di lavoro perso (E-04)

Il raggio ora fa parte del modulo del profilo: "Modifica" sblocca i cursori,
"Annulla" li riporta indietro, e si salva con "Salva profilo" insieme al
resto. Prima aveva un suo pulsante e "Salva profilo" lo perdeva.

## Verifica dell'identità di una società (E-03, M-07)

Per una società il volto da confrontare è quello del legale rappresentante,
che spesso non è chi compila. **Decisione**: la pagina "Verifica identità"
di un'azienda parla di lui ("Verifica dell'identità di Mario Rossi") e offre
due strade:
- **"Manda il link a Mario"**: un link firmato (`/verifica-legale/<token>`,
  HMAC come i link dei promemoria, 7 giorni) da copiare, mandare su WhatsApp
  o condividere dal telefono. Sulla pagina pubblica il rappresentante legge
  il consenso **a suo nome** ("Sono Mario Rossi e acconsento...") e fa la
  verifica; ogni link creato va nel registro.
- **"Mario è qui con me"**: il consenso compare solo così, scritto a nome
  del rappresentante.

L'informativa privacy dice che il consenso lo dà la persona verificata (per
una società il legale rappresentante, di solito dal link).

## "Privato" per una società (A-11, M-03)

`looksLikeCompanyName` riconosce S.r.l., S.r.l.s., S.n.c., S.p.A., S.a.s. e
cooperative. Per un nome così l'etichetta "Privato" (e la frase sui diritti
del consumatore, Codice del consumo art. 49-bis) non compare più, e non si
può salvare "Lavoro occasionale" con quel nome.

## Bollini e testi della scheda (B-11, E-10, O-14)

La nota sotto i dati dichiarati non contraddice più il "Verificato": "Abbiamo
verificato l'identità. Esperienza, lingue, qualifiche e assicurazione le
scrive il professionista." (la prima frase solo se verificato). O-14 era già
risolto dalla PR #191 (bollino Stripe rinominato, M-14).

## Lasciati aperti, da decidere con Luca

- **C-15**: due lavori alla stessa ora. Il limite di 5 clienti per fascia è
  una decisione (§364); si può aggiungere un avviso quando si propone un
  orario già occupato.
- **C-16**: "Metti in pausa" in un tocco. È una funzione nuova e la pausa di
  oggi (`pausedAt`) è dell'abbonamento: serve un campo suo.
- **0-02**: da ricontrollare con le chiavi vere di Openapi.

## Verifica

- Test nuovi: richieste a un profilo in pausa o senza dati fiscali, messaggi
  di codice fiscale/P.IVA/REA, nomi di società, link del legale
  rappresentante, ordine dei suggerimenti degli indirizzi. API: 1.146 test
  verdi; tipi e lint verdi su API, sito e pacchetti.
- Prova dal vivo in locale (Postgres, API, sito): "IT 12485671007" salvata
  come 12485671007, "lt 123456" come LT-123456, "XX-1" rifiutato con la
  sigla, link del legale rappresentante creato e aperto. Schermate da
  telefono e computer in `anteprime/gruppo8-iscrizione/`.
