# Completa profilo: percorso intero per chi inizia e popup meno invadenti

**Richiesta** (Luca, 19/11/2026): sì alle tre migliorie proposte dopo
`2026-11-19-completa-profilo-passo-giusto.md`.

**Decisioni**
1. **Tutti i passi per chi non ha ancora un profilo.** Oggi non mostra più la
   schermata centrata "Completa il tuo profilo per iniziare" ma Oggi come
   sempre (titolo, saluto) con lo stesso riquadro "Completa il profilo" di
   dopo: Profilo, Dati fiscali, Identità, Pagamenti (facoltativo), con il
   profilo pubblico come passo da fare adesso (`FIRST_PROFILE_JOURNEY` in
   `SetupJourney.tsx`, nuovo passo `profile`). Così si vede subito cosa viene
   dopo e il riquadro resta lo stesso prima e dopo il salvataggio.
2. **"Crea il profilo pubblico"** al posto di "Completa profilo" (Oggi,
   Agenda, `ProfileMissingNotice`): dice dove porta il pulsante.
3. **Popup delle notifiche.**
   - Con una finestra aperta (`aria-modal`) i popup aspettano e ricompaiono
     alla chiusura (`globals.css`): da telefono coprivano "Più tardi" di
     "Profilo salvato".
   - Raffica di notifiche: al primo profilo arrivano insieme le richieste già
     aperte in zona (nella prova oltre 80, una notifica ciascuna) e ogni
     evento in tempo reale faceva un controllo suo. Usciva un popup "Hai N
     nuovi aggiornamenti" per giro, con lo stesso id `batch-<ms>`, e React ne
     disegnava più del limite di 3, fino a coprire lo schermo. Ora quello che
     arriva entro 10 secondi dall'ultimo popup ancora aperto lo aggiorna
     (`toastBurstRef` in `AuthContext.tsx`): un solo popup che conta tutto.
     Chiuso quel popup, il conteggio riparte da capo.

**Verifica**: `e2e/tests/completa-profilo-passo-giusto.spec.ts` (telefono e
computer, 6 su 6 in locale): quattro passi in Oggi prima del profilo, popup
nascosti con "Profilo salvato" aperta, al massimo un popup dopo l'arrivo delle
richieste, poi "Compila i dati fiscali". Anteprime in
`analisi/completa-profilo-oggi/primo-profilo-*.png` e
`dopo-salvataggio-*.png` (cartella del progetto).
