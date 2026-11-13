# Copertina del profilo pubblico

**Richiesta** (Luca, 13/11/2026): far aggiungere al professionista un'immagine
che fa da sfondo alla parte alta del suo profilo, dietro il primo riquadro
bianco fino a circa metà ("al posto dello sfondo colorato che c'è ora"). Da
telefono la pagina si apre come oggi e si scorre in su per vedere la foto.
Migliorie approvate: copertine pronte per chi non ha una foto (fatte con l'IA
di Figma, "fammele vedere prima") più "quelle standard nostre con i colori senza
il simbolo del lavoro"; niente copertina nelle schede dei risultati (solo nel
profilo); copertina anche nell'anteprima di WhatsApp e social.

**Decisione**:
- Database: `ProfessionalProfile.coverImageUrl` (foto caricata, Cloudinary
  1600×800) e `coverPreset` (id di una copertina pronta). Migrazione additiva
  `20261113210000_copertina_profilo`. Mai tutte e due insieme.
- Copertine pronte in `packages/shared/src/coverPresets.ts`: una foto per
  mestiere (senza persone né scritte) e sei colori (Verde, Notte, Salvia,
  Crema, Terracotta, Cielo). File in `apps/web/public/copertine/` (1536×768
  WebP, copia 480 per la scelta, JPG 1200×630 per l'anteprima social). Nella
  scelta prima i mestieri del professionista, poi i colori, poi gli altri.
- API: `POST /professionals/me/cover` (foto, 10 all'ora) e
  `PUT /professionals/me/cover` (copertina pronta o `null` per toglierla).
- **Contatti nascosti anche nella copertina** (CLAUDE.md §5 punto 9): prima di
  pubblicarla Claude Haiku guarda l'immagine
  (`apps/api/src/professionals/cover-image-check.ts`) e la rifiuta se ci sono
  telefono, email, sito, @social, WhatsApp, QR code, oppure se non è adatta;
  il professionista legge cosa togliere. Senza chiave in produzione nessuna
  foto passa senza controllo (restano le copertine pronte). La copertina
  compare anche tra le immagini nelle segnalazioni dell'admin.
- Pagina profilo: la copertina sta dietro percorso e primo riquadro fino a
  metà riquadro, a tutta larghezza; sulle foto e sui colori scuri un velo in
  alto e il percorso diventa bianco. Da telefono 180 px di copertina sopra il
  riquadro, la pagina si apre già scesa di 180 px (script in linea + controllo
  dopo la navigazione), si vede scorrendo in su. Niente scorrimento se il
  link ha un `#` o se si è già scesi.
- Area professionista, "Il mio profilo": campo "Immagine di copertina" con
  ritaglio 2:1 e due linee guida (da telefono si vede la parte centrale), le
  copertine pronte e "Togli la copertina". Si salva subito, come la foto.
- Anteprima social (`opengraph-image.tsx`): copertina sotto un velo verde,
  sopra foto, nome e mestiere come prima.

**Motivo**: un profilo con la foto dei propri lavori dice subito chi è il
professionista; le copertine pronte evitano profili spogli a chi non ha foto.
Il controllo con l'IA impedisce di aggirare la regola dei contatti.

**Verifica**: prove `coverPresets.test.ts` (ordine, scelta, id non validi,
file presenti) e `cover-image-check.test.ts`; prove di professionals, admin e
auth verdi (237). Controllo vero con Claude Haiku: foto pulita "ok", foto con
un numero di telefono "contatti", solo nome dell'attività "ok" (1-2 s).
Pagina e area professionista fotografate da computer e da telefono
(nessuno scorrimento orizzontale, telefono aperto a 180 px).
