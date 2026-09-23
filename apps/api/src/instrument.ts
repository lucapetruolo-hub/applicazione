import * as Sentry from "@sentry/nestjs";

/**
 * Error tracking (CEO, tattico — il CTO segnalava "un 500 in produzione, un
 * cron fallito o un'email non inviata non li vede nessuno"). Va importato
 * prima di qualunque altro modulo in main.ts, come richiesto da Sentry per
 * strumentare Express/Nest. Stesso principio di Stripe/Cloudinary/Resend:
 * senza `SENTRY_DSN` non fa nulla, l'API parte comunque.
 */
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? "development",
    // Solo errori, niente tracing delle performance: resta nella quota
    // gratuita di Sentry.
    tracesSampleRate: 0,
    // Nessun dato personale (IP, header, cookie) inviato a Sentry di default.
    sendDefaultPii: false,
  });
}
