# 16/11/2026 — "Scatta dal telefono": codice QR nella finestra foto del computer

**Richiesta di Luca.** Miglioria proposta dopo
`2026-11-16-webcam-da-computer.md` ("Un QR code 'Scatta dal telefono' accanto
alla webcam"): Luca ha risposto "sì".

**Motivo.** Da telefono la foto di un guasto viene molto meglio che dalla
webcam (fotocamera posteriore, messa a fuoco da vicino, si porta fino al
guasto). Chi cerca dal computer non deve mandarsi la foto per email o chat.

**Come funziona.**
- Dal computer il pulsante foto apre sempre la finestra al centro: "Scatta con
  la webcam" (solo con una webcam), **"Scatta dal telefono"**, "Scegli dal
  computer". Vale per il tasto "Foto" della home e per lo spazio foto della
  richiesta (`PhotoPicker.tsx`).
- "Scatta dal telefono" (`PhoneHandoff.tsx`): codice QR, tre passi in parole
  semplici, "Aspetto il telefono… Il codice vale 10 minuti", poi "Telefono
  collegato: aspetto la foto…". La foto arriva da sola e la finestra si chiude,
  come con un file scelto. Se il codice scade: "Nuovo codice".
- Il telefono apre `/scatta/<codice>` (`app/scatta/[codice]/`): "Scatta una
  foto" (fotocamera posteriore) o "Scegli dalla galleria", "Va bene questa
  foto?" con "Manda al computer" e "Rifai", poi "Fatto, la foto è sul
  computer". Link usato o scaduto: "Questo codice è scaduto" con cosa fare.

**Sicurezza e privacy** (API `apps/api/src/photo-handoff/`).
- Due segreti da 128 bit: il **codice** nel QR serve solo a mandare UNA foto;
  la **chiave** resta nel computer e serve solo a prenderla. Chi fotografa il
  QR non può leggere la foto. Nel database solo le impronte sha256.
- La chiave viaggia nel corpo della richiesta, mai nell'indirizzo (niente log).
  La pagina del telefono ha `referrer: no-referrer` e `noindex`.
- La foto si rimpicciolisce sul telefono e perde la posizione GPS prima di
  partire (`shrinkPhoto`, come la ricerca con foto); sul server si controlla
  che sia davvero JPEG, PNG o WebP e al massimo 3 MB.
- Vive al massimo 10 minuti nella tabella `photo_handoffs` (nel database e non
  in memoria: l'API può girare in più copie): si cancella appena il computer la
  prende, quando si chiude la finestra, o dall'attività ogni 10 minuti.
- Limiti: 30 codici al giorno per indirizzo (`PHOTO_HANDOFF_IP_DAILY_LIMIT`,
  tetto condiviso in `daily_budget_usage`), più i limiti al minuto per ogni
  chiamata. Nessun costo: niente IA in questo passaggio. La foto poi segue la
  stessa strada di un file scelto (Turnstile e limiti della ricerca con foto).
- Migrazione solo additiva: `20261116180000_foto_dal_telefono`.

**Verifica.**
- `apps/api/src/photo-handoff/photo-handoff.service.test.ts`: consegna una
  volta sola, il codice del QR non basta per leggere, scadenza, chiusura,
  codici malformati. Tutte le 1585 prove dell'API verdi.
- `e2e/tests/webcam-da-computer.spec.ts`: prova vera computer + telefono con
  API e database (QR → telefono collegato → foto mandata → arriva nella
  richiesta → stesso link scaduto), più senza webcam.
- Prova a mano con API e Postgres locali: home da computer e pagina da
  iPhone. Foto in project-files `anteprime/webcam-da-computer/` (8-15).
- `pnpm lint` e `pnpm typecheck` di sito e API verdi.
