# Micro-interazioni: righe che sfumano, finestre che compaiono, cuoricino che batte

**Richiesta** (Luca, 28/10/2026): valutare 10 micro-tecniche CSS viste nei
reel di Ania Kubow, dare una priorità per schermata e fare subito le 3 più
utili, adattate al nostro design, con fallback, "riduci movimento" e buone
prestazioni su telefono. Valutazione completa in
`/mnt/project-files/analisi/micro-interazioni-reel.md`.

**Decisione**: le tre con più valore e meno rischio per l'identità del sito.

1. **Bordi sfumati nelle righe che scorrono di lato** (`.scroll-fade` in
   `globals.css`): solo CSS, `animation-timeline: scroll(self inline)` muove
   due variabili registrate con `@property` che disegnano la maschera. Sfuma
   solo il lato dove c'è altro. Usata in `CategoryCarousel` (categorie in
   home da computer, Richieste, Le mie richieste), foto dei lavori nel profilo
   da telefono e foto della richiesta in `RequestCard`. Fallback: dentro
   `@supports (animation-timeline: scroll())`, senza supporto la riga resta
   com'era. Non è un movimento: con "riduci movimento" resta (la regola
   globale porta la durata a 0,01 ms, qui torna `auto`). Nella griglia delle
   categorie da telefono e nelle foto da computer (vanno a capo) niente
   maschera, che taglierebbe ombre e contorno del focus. Le barre a schede
   delle aree riservate e "Appena arrivati" avevano già la sfumatura in JS
   (§349, §232): lasciate così.
2. **Finestre che compaiono con dolcezza**: una regola con `@starting-style`
   su `[role="dialog"][aria-modal="true"]` e `.notif-panel` (salgono di 12 px
   mentre appaiono) e sul fondo scuro (`:has()`), 180-220 ms. Nessun
   componente cambiato. Solo con `prefers-reduced-motion: no-preference`;
   senza supporto compaiono subito come prima. Solo `opacity` e `translate`:
   nessun salto di impaginazione.
3. **Cuoricino "Salva" che batte** (`IconActionButton` con `celebrate`):
   battito di 420 ms e anello verde (#128552) che si allarga e svanisce. Parte
   solo quando il salvataggio riesce dopo un tocco, non quando la pagina
   carica i profili già salvati, e non togliendo il salvataggio. Niente
   particelle né coriandoli (scelta di Luca). Spento con "riduci movimento".

Scartate o rimandate (motivi nell'analisi): grana sui gradienti (già nella
hero e parte dell'effetto "metallico", la decide il thread della hero),
riflesso lucido e bagliore dietro la foto (aspetto da sito fatto con IA),
vetro sfocato (già nelle barre fisse), pulsanti con più ombre (solo con
anteprima), pulsante che si allarga e scatti nella lightbox (proposti).

**Verifica**: `pnpm lint` e `typecheck` verdi; foto in
`/mnt/project-files/anteprime/micro-interazioni/` (righe categorie a inizio,
metà e fine; cuoricino durante il battito e dopo; finestra "Segnala" mentre
entra e aperta, telefono e computer). Con "riduci movimento" emulato la
sfumatura resta (`--scroll-fade-start` 40px a metà riga).
