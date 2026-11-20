import * as Sentry from "@sentry/nestjs";

/**
 * Error tracking (CEO, tattico — il CTO segnalava "un 500 in produzione, un
 * cron fallito o un'email non inviata non li vede nessuno"). Va importato
 * prima di qualunque altro modulo in main.ts, come richiesto da Sentry per
 * strumentare Express/Nest. Stesso principio di Stripe/Cloudinary/Resend:
 * senza `SENTRY_DSN` non fa nulla, l'API parte comunque.
 */
/** Header e parametri con indirizzi IP o nomi utente, tolti come faceva Sentry 10. */
const PII_DENY = ["forwarded", "-ip", "remote-", "via", "-user"];

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    // Solo errori, niente tracing delle performance: resta nella quota
    // gratuita di Sentry.
    tracesSampleRate: 0,
    // Nessun dato personale (IP, header, cookie, corpo delle richieste,
    // query al database) inviato a Sentry. Da Sentry 11 `sendDefaultPii` non
    // c'è più e senza `dataCollection` raccoglierebbe tutto questo: qui i
    // valori che Sentry indica per restare come la versione 10
    // (docs/changelog/2026-11-20-stripe-23-nestjs-12.md).
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: PII_DENY }, response: { deny: PII_DENY } },
      httpBodies: [],
      urlQueryParams: { deny: PII_DENY },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
  });
}
