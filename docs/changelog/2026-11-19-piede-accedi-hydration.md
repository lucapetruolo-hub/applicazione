# Piè di pagina: niente errore per chi è collegato

**Richiesta** (Luca, 19/11/2026, thread "Aggiungere entrate e uscite per i professionisti", miglioria 1 "sì"): durante le foto della scheda Entrate e uscite il sito, in sviluppo, segnalava "Hydration failed" su ogni pagina pubblica per chi era collegato.

**Decisione**: `FooterLoginLink` (`apps/web/src/components/SiteFooterParts.tsx`) nasconde "Accedi" solo dopo l'aggancio della pagina (`useSyncExternalStore` con valore del server `false`). Il piede è dentro un `Suspense` e si aggancia quando l'utente è già noto: il server aveva scritto "Accedi", il browser no, e React rifaceva da capo tutto il piede.

**Motivo**: l'errore fa ridisegnare la parte di pagina e in sviluppo copre tutto con l'avviso; per l'utente il risultato non cambia (chi è dentro non vede "Accedi").

**Verifica**: con Playwright, collegati, su `/`, `/per-professionisti` e `/per-professionisti/excel-gratuito`: zero errori di aggancio e nessun link "Accedi" nel piede (prima: un errore per pagina).
