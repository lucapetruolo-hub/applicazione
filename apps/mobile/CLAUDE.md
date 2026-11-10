# apps/mobile: regole dell'app

Si carica quando Claude Code lavora in `apps/mobile`. App da rifare solo a
sito finito (decisione di Luca). Testo da `CLAUDE.md` §2 (10/11/2026).

@../../docs/architettura/interfaccia.md

## Note tecniche

- Il build di produzione di `apps/mobile` avviene su **EAS Build** (cloud).
  Dal passaggio a Expo 58 (§299) `npx expo export --platform android|ios`
  funziona anche in locale ed è un buon controllo veloce che il pacchetto
  si generi; `npx expo-doctor` controlla le versioni.
