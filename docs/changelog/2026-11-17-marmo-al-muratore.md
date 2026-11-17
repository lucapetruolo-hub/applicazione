# Marmo levigato o lucidato al muratore, non a un mestiere mancante

**Richiesta** (giro di prova del 17/11/2026, banco dell'IA dopo la #390): sul
sito "Levigare il marmo" finiva tra i mestieri che nessuno fa ancora
("Marmista"), mentre prima andava al muratore. Il thread dei mestieri senza
iscritti ha visto che è una variazione di Claude Haiku, non le sue modifiche,
e ha proposto le due correzioni qui sotto. Dentro le regole già decise: il
dizionario lo cambiamo a mano, l'IA non ci scrive da sola.

**Decisione**:
- Dizionario (`packages/shared/src/problemMatch.ts`): "marmo", "marmi",
  "marmette" al muratore (3) e poco alle pulizie (1); "levigare/levigatura" e
  "lucidare/lucidatura" un punto a muratore e pulizie, così il parquet resta
  al falegname.
- Nella riga dell'elettricista "luci " diventa parola intera: prima "lucidare il
  marmo" andava all'elettricista, perché "luci" è l'inizio di "lucidare".
- Istruzioni dell'IA (`problem-match.service.ts`): `missingTrade` solo se
  nessun mestiere del sito può fare il lavoro, nemmeno in parte; tra i casi
  frequenti "levigatura o lucidatura di marmo e pavimenti in pietra = muratore,
  poi pulizie (non un mestiere mancante)".

**Verifica**:
- Test del dizionario: levigare/lucidare il marmo → muratore, pulizie;
  levigatura parquet → falegname; "luci del bagno" → elettricista.
- API in locale con Haiku: "Levigare il marmo" e "lucidare il pavimento in
  marmo" → muratore, pulizie; "orlo dei pantaloni" → Sarto e "accordare il
  pianoforte" → Accordatore restano mestieri mancanti.
- Banco delle 376 frasi sull'API in locale: risultato in
  `analisi/abbinamento-problema/misura-ia/banco-2026-11-17-marmo.log`.

## Titolo della sezione del secondo mestiere (Luca, 17/11/2026)

"Può farlo anche un falegname" diventa "Potrebbe farlo anche un falegname"
(`CercaContent.tsx`): il secondo mestiere è un'ipotesi della ricerca, non una
certezza, e il condizionale lo dice senza promettere
(docs/changelog/2026-11-17-ricerca-home-in-attesa.md).

## Eccezione di osv-scanner per picomatch (Luca, 17/11/2026)

osv-scanner è diventato rosso su tutte le PR per GHSA-fc5q-39xc-vjpf (ReDoS in
picomatch, nessuna versione corretta: l'ultima colpita è la 4.0.7). Luca ha
approvato l'eccezione in `osv-scanner.toml`, come per deepmerge e minimatch,
solo per le versioni 2.3.2, 4.0.4 e 4.0.7: picomatch lo usano solo strumenti di
sviluppo e di build (Metro, Jest, ricerca dei file) con schemi di file scritti
da noi, e l'API non lo usa (`pnpm why picomatch --prod`). Da togliere quando
esce una versione corretta.
