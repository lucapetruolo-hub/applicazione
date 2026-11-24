# Lavoro annullato: niente più contatti del cliente per il professionista

**Richiesta** (Luca, 24/11/2026, "sì" alla proposta nel thread "Mostrare chi
ha annullato e quando"): su un lavoro annullato la scheda del professionista
mostrava ancora Chiama, WhatsApp, Email e l'indirizzo completo del cliente.

**Decisione**: quando una prenotazione è `CANCELED`, l'API
(`getMyBookings` in `apps/api/src/professionals/professionals.service.ts`)
non manda più telefono, email, via, numero civico, note dell'indirizzo e
telefono di chi riceve; restano nome, città, CAP, provincia, la data e la chat.
Se l'appuntamento si riapre torna `CONFIRMED` e i contatti tornano. Un lavoro
non presentato (`NO_SHOW`) o terminato li tiene.

**Motivo**: CLAUDE.md §5 punto 9, i contatti del cliente valgono solo finché
c'è un impegno reciproco confermato; annullato il lavoro l'impegno non c'è
più. La rubrica Clienti già teneva fuori chi ha solo lavori annullati
(`buildClientBook`). Per parlarsi resta la chat. Il controllo dei contatti
scritti in chat guarda solo se il preventivo è stato accettato: dopo un
annullamento non li ferma (proposta separata, non fatta qui).

**Verifica**: `e2e/tests/chi-ha-annullato.spec.ts` controlla che sulla scheda
annullata non ci siano "Chiama", l'indirizzo e l'email.
