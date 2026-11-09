# Sicurezza: correzioni del controllo pre-lancio (gruppo 4)

**Richiesta**: controllo completo pre-lancio dell'08/11/2026
(`collaudo/2026-11-08/riepilogo.md`, rapporti `esperto-E2-sicurezza.md` e
`esperto-E1-sviluppo.md`). Luca: "sì a tutto quello che ritieni" → gruppo 4
"Sicurezza" (E2-01…E2-06, E1-04) più le migliorie "sì" dello stesso tema.

**Decisioni e motivo**

- **E2-01, accesso con Google**: il server rifiuta un `id_token` con
  `email_verified` diverso da `true` (`auth.service.ts`). Prima chi otteneva
  da Google un token con l'email di un nostro utente, non verificata, entrava
  nel suo account. Lo stesso controllo anche nel browser
  (`idTokenClaims` in `apps/web/src/lib/googleSignIn.ts`).
- **Miglioria sì, `nonce` controllato dal server**: prima il `nonce` lo creava
  e lo controllava solo il browser, quindi un token rubato (vale un'ora)
  mandato direttamente a `POST /auth/google/verify` entrava. Ora il sito lo
  chiede a `POST /auth/google/nonce` (pubblica, 30/min), firmato con una
  chiave legata a `JWT_SECRET`, valido 30 minuti e una volta sola
  (`apps/api/src/auth/google-nonce.ts`). Il pulsante lo chiede appena
  compare e ogni 20 minuti: chiederlo al tocco e aspettare farebbe perdere al
  browser il permesso di aprire la finestra. Al cambio di versione, per i
  pochi minuti in cui sito e API non sono allineati, l'accesso con Google può
  rispondere "Accesso con Google scaduto. Riprova.".
- **E2-02, limiti al minuto per indirizzo**: sull'API pubblicata (Cloudflare
  → Render) `req.ip` era un nodo intermedio diverso a ogni richiesta. Il
  limite ora conta `CF-Connecting-IP`, che Cloudflare scrive e sovrascrive,
  solo su Render (`RENDER=true`, messa da Render); altrove resta `req.ip`. Mai
  il primo valore di `X-Forwarded-For`, che chi chiama può scrivere
  (`apps/api/src/common/client-ip.ts`, `ClientIpThrottlerGuard`). Lo stesso
  indirizzo va a Turnstile. A ogni avvio il log di Render dice una volta se
  l'intestazione arriva, senza indirizzi: se scrive "ASSENTE" la lettura va
  rivista.
- **E2-03, CSP**: tolto `'unsafe-eval'` dalla CSP di produzione
  (`apps/web/next.config.mjs`). Nel browser zod è `jitless`
  (`packages/shared/src/zod.ts`): senza, zod proverebbe `new Function` e la
  console mostrerebbe un errore di sicurezza a ogni pagina. `'unsafe-inline'`
  resta (scelta di Luca del 2/11, niente nonce).
- **E2-04**: `JwtAuthGuard` risponde 401 anche per un token di un account che
  non esiste più (prima la richiesta proseguiva e finiva in 404/500).
- **E2-05/E1-04**: nei log delle email non c'è più l'indirizzo, solo l'inizio
  dell'impronta (`emailFingerprint`) e il dominio (`recipientForLog`).
- **E2-06, CSV**: una cella che comincia con `=`, `+`, `-`, `@`, tab o a capo
  prende un apostrofo davanti (`packages/shared/src/csv.ts`), gli importi
  negativi restano numeri. Vale per gli export dell'admin e, già che c'era,
  per l'estratto mensile e il riepilogo delle ricevute del professionista, che
  contengono nomi dei clienti e descrizioni dei lavori scritti da altri.

- **"Esci" che chiude davvero l'accesso** (miglioria facoltativa, scelta da
  Luca il 09/11): prima "Esci" cancellava solo il token nel browser, che
  restava valido 30 giorni (su un computer condiviso bastava averlo copiato).
  Ogni token nuovo ha un codice suo (`jti`); "Esci" chiama `POST /auth/logout`,
  che lo mette nella tabella `revoked_sessions` fino alla scadenza del token
  (pulita ogni notte). Gli altri dispositivi restano dentro. Il controllo è
  in `JwtAuthGuard` e nello stream in tempo reale (chiuso entro 25 secondi).
  Un token emesso prima di questa versione non ha il codice: "Esci" con quel
  token chiude tutti gli accessi dell'account, una volta sola.

**Non fatto (non scelto o fuori tema)**: token in cookie `httpOnly` (decisione
§292/§359, dopo il lancio); E2-07 `deepmerge` (già in eccezione, nessuna
correzione pubblicata).

**Verifica**: test nuovi `google-nonce.test.ts`, `google-name.test.ts`
(email non verificata, nonce mancante o falso, stesso token due volte),
`jwt-auth.guard.test.ts`, `logout.test.ts`, `client-ip.test.ts`, `email-log.test.ts`,
`csv.test.ts`; build del sito controllata senza `eval`/`new Function` negli
script inviati al browser; test, typecheck e lint di tutto il monorepo.
