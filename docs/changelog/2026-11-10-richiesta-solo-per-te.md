# Richiesta "Solo per te" o mandata a più professionisti

**Richiesta** (Luca, 10/11/2026): "Nella richiesta preventivo, nella mail e
nell'elenco il professionista come fa a capire se è una richiesta generica o a
lui personalmente?"

**Com'era**: nell'elenco c'era solo la riga "Nessuno degli altri N
professionisti ha ancora risposto" (§147), e per una richiesta diretta non
c'era niente: il professionista doveva accorgersi che la riga mancava. Nella
richiesta aperta lo diceva solo la prima riga della cronologia, in basso.
L'email "Nuova richiesta" era uguale in tutti i casi, e per una diretta era
fuorviante ("Chi risponde per primo ha più probabilità…" senza nessun altro).

**Decisione** (Luca ha scelto i punti 1-5 della proposta):
1. Bollino in testa alla scheda di Richieste e lavori, visibile sia nell'elenco
   sia nella richiesta aperta: **Solo per te** (verde) per la diretta,
   **Scelto tra N** (verde) quando il cliente ne ha scelti da 2 a 5 (§393),
   **A più professionisti** (neutro) per la generica. La riga "N altri hanno
   risposto" resta. In Oggi, "Da rispondere ora", solo i due verdi: le altre
   hanno già la riga degli altri professionisti.
2. Email: per la diretta l'oggetto è "Richiesta per te: Idraulico a Roma", il
   testo dice "ha mandato la richiesta **solo a te**" e non c'è più la frase
   "chi risponde per primo". Per la scelta tra pochi "ha scelto **te e altri
   2 professionisti**". Per la generica (e per inoltri e richieste arrivate
   dopo) una riga in più: "La richiesta è arrivata anche ad altri
   professionisti della zona". Le notifiche di prima, senza il dato, restano
   col testo di sempre.
3. Una diretta inoltrata perché non ha risposto in tempo (§209) mostra
   **Inoltrata anche ad altri**; chi la riceve per inoltro vede "A più
   professionisti".
4. "Dal tuo link" resta com'è e prende il posto del bollino (mai due).
5. Stesso testo nella campanella: "Nuova richiesta solo per te: …",
   "Nuova richiesta (scelto tra 3): …".

**Privacy**: solo il tipo e, per la scelta tra pochi, quanti sono; mai chi sono
gli altri professionisti (stessa regola del §147).

**Come**: `leadAudience()` e `leadAudienceLabel()` in
`packages/shared/src/leadAudience.ts`, calcolati da `getMyLeads` con i campi che
c'erano già (`professionalProfileId`, `forwardedAt`, `chosenProfileIds`): niente
migrazione. Il dato per l'email viaggia nel payload di `NEW_LEAD` (`audience`,
`among`). Se il sito arriva prima dell'API durante un rilascio, la scheda non
mostra il bollino invece di sbagliarlo.

**Verifica**: prove `packages/shared/src/leadAudience.test.ts`,
`apps/api/src/email/templates/new-lead-email.test.ts` e
`professionals.service.test.ts` (diretta, inoltrata, generale); anteprime
email `new_lead_per_te` e `new_lead_scelto_tra_3` in `scripts/email-preview.ts`;
foto della scheda da telefono e da computer.
