# Recensioni in controllo: avviso agli admin e, dopo 7 giorni, al cliente (20/11/2026)

**Richiesta** (Luca, 20/11: "fai il punto 3"): chiudere i due punti rimasti
aperti del gruppo 5 del collaudo del 29/10, segnati negli appunti solo come
"avviso moderatori, messaggio al cliente dopo 7 giorni".

**Come l'ho letto** (ricostruzione mia, da correggere se Luca intendeva
altro): riguardano le recensioni tenute **in controllo** per un segnale di
possibile falsità (`docs/changelog/2026-11-02-collaudo-recensioni-abusi.md`).
Fino a oggi:
- la recensione compariva solo nella coda "Da fare" dell'Admin: nessuno
  riceveva un avviso, mentre al cliente promettiamo "di solito entro 2
  giorni";
- se nessuno decideva, il cliente non riceveva più nessuna notizia.

**Decisione**:
1. Quando una recensione va in controllo, tutti gli admin ricevono un avviso
   sul sito e per email (`ADMIN_REVIEW_HELD`), che apre la scheda Recensioni
   di chi l'ha scritta, dove ci sono già "Pubblica" e "Nascondi".
2. Dopo 7 giorni ancora in controllo (giro delle 10:20,
   `ReviewHoldNoticesService`), una volta sola per recensione
   (`Review.heldNoticeSentAt`, migrazione
   `20261120130000_recensione_in_controllo_avviso`):
   - al cliente, sul sito e per email: "Stiamo ancora controllando la tua
     recensione: ci vuole più del previsto" (`REVIEW_STILL_HELD`, argomento
     "Risposte alle tue recensioni", spegnibile);
   - agli admin lo stesso avviso con "ferma da 7 giorni".
   A un cliente con l'account chiuso non si scrive.

Niente pubblicazione automatica dopo 7 giorni: decide sempre una persona
(Termini, punto 4).

**Verifica**: `review-hold-notices.test.ts` (7 giorni, una volta sola, due
copie dell'API, account chiuso); prove dell'API, typecheck e lint di API e
sito. Il confronto tra migrazioni e schema lo fa la CI (qui non c'è un database).

**Aggiornamento del 23/11/2026**: il messaggio al cliente dopo 7 giorni è stato
tolto su decisione di Luca (docs/changelog/2026-11-23-recensioni-in-controllo-solo-admin.md).
Restano gli avvisi agli admin.
