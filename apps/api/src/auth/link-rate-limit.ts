/**
 * Limite al minuto di POST /auth/verify-email (il pulsante dell'email di
 * conferma). In produzione resta sempre 10 per indirizzo. Le prove nel
 * browser partono tutte dallo stesso indirizzo e lo alzano con
 * `E2E_VERIFY_EMAIL_PER_MINUTE`, che sul server pubblicato (Render o
 * NODE_ENV=production) non vale mai
 * (docs/changelog/2026-10-28-verifica-email-con-link.md).
 */
export const VERIFY_EMAIL_PER_MINUTE = 10;

export function verifyEmailPerMinute(env: NodeJS.ProcessEnv = process.env): number {
  const deployed = env.NODE_ENV === "production" || env.RENDER === "true";
  const forTests = Number(env.E2E_VERIFY_EMAIL_PER_MINUTE);
  return !deployed && Number.isInteger(forTests) && forTests > VERIFY_EMAIL_PER_MINUTE ? forTests : VERIFY_EMAIL_PER_MINUTE;
}
