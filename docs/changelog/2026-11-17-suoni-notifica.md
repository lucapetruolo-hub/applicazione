# Suoni delle notifiche: sei nuovi a scelta, urgenze e buone notizie riconoscibili

**Richiesta** (Luca, 17/11/2026): "dammi altri esempi di suono per quando si
riceve una notifica", poi: "effettua miglioria 1 e 2, poi metti in
impostazioni delle notifiche anche la scelta del suono se vogliono cambiarla".

**Decisione**:
- Sei suoni nuovi più quello di prima, tutti generati con la Web Audio API
  (nessun file, nessun diritto d'autore): Due toni dolci (di serie), Vetro,
  Goccia, Marimba, Bolla, Campanella, Classico (quello del §152). Anteprime
  ascoltabili in `anteprime/suoni-notifica/` nella cartella del progetto.
- Miglioria 1: le richieste urgenti (icona ⚡) e i problemi (tono "cattivo"
  di `notificationTone`) hanno un suono loro, tre tocchi veloci; le buone
  notizie (tono "buono", es. preventivo accettato) la Marimba. Valgono
  qualunque sia il suono scelto, così si capisce cosa è successo senza
  guardare (`notificationSoundKind` in `apps/web/src/lib/notificationTopicStyle.ts`).
- Miglioria 2: se arrivano più notifiche in 4 secondi suona una volta sola.
  "Prova il suono" suona sempre.
- Impostazioni → Notifiche → Suono: menu "Scegli" con i sette suoni (il
  primo "consigliato"), cambiando voce si sente subito; "Prova il suono"
  accanto. Il menu si vede solo con il suono acceso.
- Preferenza nuova `soundName` in `User.notificationPrefs` (JSON, niente
  migrazione), valori in `packages/shared/src/notificationSounds.ts` (file
  senza zod, perché `notifications.ts` entra in ogni pagina). Un valore
  sconosciuto torna a "dolce".

**Verifica**: tipi di web, api e shared puliti; `pnpm lint` del sito verde;
prove di shared 205/205 (nuova prova sul suono scelto), prove notifiche
dell'API verdi. Nel browser (API finta): "Prova il suono" crea 4 oscillatori
(due note × due armoniche), scegliere "Campanella" ne crea altri 6 e salva
`soundName: "campanella"`, nessun errore. Foto della pagina in
`anteprime/suoni-notifica/scelta-computer.png` e `scelta-telefono.png`.
