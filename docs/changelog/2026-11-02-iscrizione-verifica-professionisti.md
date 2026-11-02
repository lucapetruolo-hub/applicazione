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

## Le quattro migliorie scelte da Luca ("effettua le 4 migliorie")

- **C-15, orario già occupato**: quando il professionista sceglie l'orario
  di un preventivo o di una controproposta e in quell'orario ha già un
  lavoro confermato o in attesa, sotto compare "In quell'orario hai già un
  lavoro: … Puoi mandarlo lo stesso." (`BusyTimeNotice`). Non blocca: il
  limite di 5 clienti per fascia resta (§364). **Piccola modifica a §364**:
  il babysitter parte con 1 cliente per fascia (`starterHomeCapacity`),
  perché non può seguire due famiglie alla stessa ora; il numero si cambia
  in Agenda come per tutti.
- **C-16, "Metti in pausa"**: un campo suo, `ProfessionalProfile.awayUntil`
  (la pausa dell'abbonamento, `pausedAt`, resta separata). In Agenda →
  Orari "Metti in pausa" con "Torno il" (da domani, al massimo 180 giorni);
  durante la pausa la scheda "Sei in pausa: torni …" con "Riprendi ora" e
  "Cambia data" sta anche in Home. Fino a quel giorno il profilo esce dalla
  ricerca e dallo smistamento delle richieste e non accetta prenotazioni
  dirette; i lavori già fissati restano. Il profilo pubblico (dal link)
  dice "In pausa: torna giovedì 12 novembre" e propone altri professionisti.
  Il filtro sta in `searchableProfileConditions()` e in
  `professionalRestrictions` (`away`), gli stessi punti del blocco per le
  segnalazioni.
- **0-02, "Verificati" falso**: con `OPENAPI_SANDBOX=true` Openapi risponde
  con dati finti a qualunque numero, quindi un "valido" di prova vale come
  "numero corretto" (REVIEW, "PROVA") e non dà il bollino; la scritta dice
  "Siamo in prova: il controllo ufficiale parte con il lancio.". Se la prova
  resta accesa dopo `LAUNCH_DATE` l'API lo segnala in Sentry. Prima del
  lancio servono le chiavi vere (checklist).
- **Admin, cambiare il tipo**: in `/admin/verifiche` "Cambia tipo" (privato senza
  Partita IVA, con Partita IVA, azienda) con un motivo obbligatorio, solo
  finché il professionista non ha collegato Stripe (il conto Stripe è legato
  al tipo). Il cambio toglie la dichiarazione dei dati fiscali da rifirmare,
  toglie il "Verificato" se c'era, va nel registro azioni e avvisa il
  professionista (`FISCAL_ENTITY_TYPE_CHANGED`, link a Dati fiscali).

## Migliorie alla pausa (Luca, "effettua miglioria 1-2-4")

- **Avviso il giorno prima del ritorno**: alle 10 (ora di Roma) sito ed
  email "La tua pausa finisce: torni …" con "Apri l'agenda" (`AWAY_ENDING`,
  in "Promemoria e agenda", spegnibile). Una volta sola per pausa
  (`awayReminderSentAt`, migrazione `20261102200000_pausa_avviso`), di nuovo
  da mandare se cambia la data.
- **Richieste aperte alla ripresa**: con "Riprendi ora" e a fine pausa
  (controllo ogni ora in `AwayService`, che azzera `awayUntil`) il
  professionista riceve le richieste ancora aperte della sua zona, come chi
  si iscrive dopo una richiesta (§271, `matchWhenVisible`); quelle già
  ricevute non si ripetono.
- **In Admin**: in "Professionisti in numeri" e nella scheda della persona
  lo stato "In pausa per scelta, con il giorno di ritorno" (`AWAY`), separato
  dalla pausa dell'abbonamento.

## Verifica

- Test nuovi: richieste a un profilo in pausa o senza dati fiscali, messaggi
  di codice fiscale/P.IVA/REA, nomi di società, link del legale
  rappresentante, ordine dei suggerimenti degli indirizzi, pausa con data di
  ritorno, risposte di prova di Openapi, cambio di tipo dall'admin, orari di
  partenza del babysitter, avviso e fine della pausa. API: 1.161 test verdi; tipi e lint verdi su API,
  sito e pacchetti.
- Pausa provata dal vivo: oggi rifiutato, 12/11 salvato, il profilo sparisce
  dalla ricerca di Latina e torna con "Riprendi ora".
- Prova dal vivo in locale (Postgres, API, sito): "IT 12485671007" salvata
  come 12485671007, "lt 123456" come LT-123456, "XX-1" rifiutato con la
  sigla, link del legale rappresentante creato e aperto. Schermate da
  telefono e computer in `anteprime/gruppo8-iscrizione/`.
