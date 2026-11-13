# Difese della ricerca con foto (13/11/2026)

**Richiesta** (Luca, thread "Far conoscere all'IA tutti i servizi del sito"):
"qual è il limite di ricerca con foto attuale? e se un malintenzionato cambiasse
sempre IP?". Prima c'erano solo 6 foto al minuto per indirizzo e il tetto
comune di 3000 chiamate all'IA al giorno: chi cambia indirizzo poteva
esaurire il tetto e spegnere l'IA anche per la ricerca a parole. Luca ha
detto sì alle tre difese insieme.

**Decisione**:
- **Turnstile** prima di mandare la foto, lo stesso controllo anti-bot della
  registrazione (`assertTurnstile`, campo `turnstileToken`). Il widget si
  carica solo dopo aver scelto una foto, così la home resta leggera. Di norma
  non si vede; senza `TURNSTILE_SECRET_KEY` il controllo è spento come altrove.
  Se la verifica non è pronta dopo 5 secondi e c'è del testo, si cerca a parole.
- **10 foto al giorno per indirizzo** (oltre alle 6 al minuto), con un 429 e
  "Per oggi hai già cercato con molte foto: scrivi il problema con parole tue";
  con del testo il sito cerca a parole. 10 e non 6 perché con i telefoni molte
  persone escono con lo stesso indirizzo. `PROBLEM_PHOTO_IP_DAILY_LIMIT` lo
  cambia (il banco di prova lo alza a 1000).
- **Tetto delle foto per tutto il sito: 1000 al giorno**, separato da quello
  del testo: finito quello la foto risponde "spenta" (il sito cerca a parole)
  e arriva un avviso a chi gestisce il sito; la ricerca a parole tiene l'IA.
  `PROBLEM_PHOTO_DAILY_LIMIT` lo cambia. 1000 foto costano circa 1-1,5 $.

**Verifica**: test dell'API (`problem-photo.test.ts`: 10 per indirizzo poi no,
altro indirizzo e giorno dopo sì, variabile che alza il limite; tetto delle
foto che non tocca quello del testo), typecheck e lint, `check-render-env`.
