# Recensioni in controllo: niente messaggio al cliente dopo 7 giorni (23/11/2026)

**Richiesta**: Luca, riletto come funzionano gli avvisi per le recensioni
fermate (docs/changelog/2026-11-20-recensioni-in-controllo-avvisi.md): "Non
serve l'avviso al cliente".

**Decisione**: tolto il messaggio al cliente "Stiamo ancora controllando la
tua recensione" (tipo `REVIEW_STILL_HELD`, sul sito e per email) che partiva
dopo 7 giorni in controllo. Restano i due avvisi agli admin
(`ADMIN_REVIEW_HELD`): subito, quando la recensione viene fermata, e di nuovo
dopo 7 giorni se è ancora ferma. Resta anche la proposta di Haiku ("Pubblica"
o "Non pubblicare") nella scheda Recensioni di Admin.

Il tipo `REVIEW_STILL_HELD` è tolto da `packages/shared`, dai testi del sito e
dai modelli email. Un avviso di quel tipo già in elenco si vedrebbe con il
testo generico; nel database ci sono solo account di prova.

**Motivo**: al cliente non serve sapere che il controllo dura di più, e non
può farci niente; chi deve muoversi sono gli admin.

**Verifica**: `apps/api/src/reviews/review-hold-notices.test.ts` (un solo
avviso, agli admin), prove di `packages/shared`, `typecheck` e `lint`.
