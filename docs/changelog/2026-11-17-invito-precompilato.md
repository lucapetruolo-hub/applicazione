# Invito già compilato e zone nei "Più richiesti"

**Richiesta** (Luca, 17/11/2026, thread "Gestire le richieste per mestieri
senza iscritti"):

- Luca ha scelto "Sì, precompila": in Admin › Richieste in attesa, "Invita
  un professionista" apre il modulo con il comune e il mestiere già scritti.
- Luca ha detto "si" alle zone accanto a ogni mestiere nei "Più richiesti"
  (es. "Antennista 12: Bari 7, Lecce 3, Roma 2").
- Luca ha detto **no** al tasto "chiedi un preventivo a tutti quelli lontani
  con un tocco": non si fa.

**Come funziona**

- `waitingInviteHref` (`packages/shared/src/waitingTrade.ts`) costruisce il
  link `/admin/professionisti?mestiere=Antennista&citta=Bari`. Per "Senza
  città" il link non porta la città.
- `/admin/professionisti` legge l'indirizzo una sola volta, all'apertura. Il
  comune va nel campo Comune. La presentazione diventa `waitingInviteBio`:
  "Faccio il lavoro di antennista.", con una riga che spiega da dove arriva.
- Il mestiere sta nella presentazione perché le richieste in attesa cercano le
  parole del mestiere anche lì: appena il profilo è attivo gli arrivano da
  sole. Una prova controlla che la presentazione di partenza basti per gli 8
  lavori fuori servizio e per un mestiere scritto dall'IA.
- `countRequestedTrades` conta anche le zone, senza " e provincia", dalla più
  richiesta. L'Admin mostra le prime 4 sotto il nome, poi "altre N".
- Il cliente non compare mai: nell'invito ci sono solo il mestiere e il
  comune (CLAUDE.md §5 punto 9).

**Verifica**:

- prove di `packages/shared` (217);
- typecheck di API e sito, `pnpm lint`;
- prova nel browser `e2e/tests/richiesta-in-attesa.spec.ts`, da telefono e da
  computer: zone nei più richiesti, link dell'invito, modulo compilato.

Foto in `anteprime/richieste-in-attesa/` (`4-admin-*`, `6-invito-*`).
