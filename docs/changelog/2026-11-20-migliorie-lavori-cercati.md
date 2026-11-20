# Migliorie di "Lavori cercati" dopo le misure

**Richiesta (Luca, 20/11/2026):** "Effettua migliorie", dopo l'unione delle
misure C, D, E e G (`docs/changelog/2026-11-20-misure-lavori-cercati.md`).
Scelte le tre che valgono di più, scritte nel thread della bacheca.

**Cosa cambia**
- *Annuncio e invito in "Dove mancano professionisti"* (Admin, Richieste da
  seguire): per ogni mestiere e provincia senza nessuno entro 100 km,
  "Copia annuncio" (`boardUncoveredAd` in `packages/shared/src/requestBoard.ts`:
  solo mestiere, provincia e numero, mai dati del cliente; il prezzo lo decide
  il professionista, CLAUDE.md §5 punto 18) e "Invita un professionista"
  (`boardUncoveredInviteHref`: mestiere e, se la provincia è anche un comune,
  città già scritti). Il link dell'annuncio porta a
  `/lavora-con-noi/<mestiere>/<provincia>`, che segna la visita: chi si
  iscrive da lì conta tra gli iscritti da Lavori cercati.
- *Provenienza in Andamento:* "Da dove arrivano i professionisti" ha la voce
  "Da «Lavori cercati»" (`User.signupFromBoard`). Un invito (operatore,
  collega, partner) resta più forte; Lavori cercati vince sulla provenienza
  della prima visita, che direbbe solo "Google" o "Non si sa".
- *"Rispondi" dall'avviso sul sito:* il link della notifica `BOARD_NEARBY`
  porta `da=avviso` e la pagina /rispondi lo conta (`RISPONDI_AVVISO`), come
  già mappa, pagine, Oggi ed email del lunedì.

**Motivo:** l'Admin diceva dove mancano professionisti senza aiutare a
trovarli; le altre due chiudono due buchi nei numeri appena aggiunti.

**Verifica:** `packages/shared/src/requestBoard.test.ts` (annuncio, invito,
ogni `da` con il suo contatore), test dell'API di admin, bacheca e contatori,
typecheck e lint del sito.
