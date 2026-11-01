import { Prisma } from "@professionisti/database";
import { SIGNUP_FUNNEL_STEPS, type AdminSignupFunnel, type SignupFunnelStep, type SignupFunnelWeek } from "@professionisti/shared";

/** Settimane mostrate nell'imbuto dell'iscrizione. */
export const SIGNUP_FUNNEL_WEEKS = 12;

/** Una riga della query: una settimana di iscrizione con i conteggi (bigint da Postgres). */
export type SignupFunnelRow = {
  week_start: Date;
  account: bigint;
  email: bigint;
  profile: bigint;
  card: bigint;
  card_24h: bigint;
  card_7d: bigint;
  fiscal: bigint;
  identity: bigint;
  payments: bigint;
};

/**
 * Imbuto dell'iscrizione del professionista per settimana
 * (docs/changelog/2026-10-30-iscrizione-carta-solida.md). Si parte dagli
 * account professionista creati da sé: niente account di prova (§395),
 * niente profili dimostrativi né creati da un operatore e non ancora
 * confermati. Contano anche gli account chiusi dopo: si sono iscritti e sono
 * parte del calo. Settimana di Roma, che parte il lunedì; dal lancio se c'è.
 */
export function signupFunnelSql(from: Date | null, now: Date): Prisma.Sql {
  const since = new Date(now.getTime() - SIGNUP_FUNNEL_WEEKS * 7 * 24 * 60 * 60 * 1000);
  const start = from && from > since ? from : since;
  return Prisma.sql`
    WITH pros AS (
      SELECT
        date_trunc('week', (u."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Rome') AS week_start,
        u."emailVerifiedAt" AS email_at,
        p.id AS profile_id,
        p."createdAt" AS profile_at,
        p.verified AS identity_ok,
        s."cardAddedAt" AS card_at,
        f."fiscalDataCompleteAt" AS fiscal_at,
        COALESCE(f."stripeChargesEnabled", false) AS payments_ok
      FROM "users" u
      LEFT JOIN "professional_profiles" p ON p."userId" = u.id
      LEFT JOIN "subscriptions" s ON s."professionalProfileId" = p.id
      LEFT JOIN "professional_fiscal_profiles" f ON f."professionalProfileId" = p.id
      WHERE u.role = 'PROFESSIONAL'
        AND u."testAccountAt" IS NULL
        AND u."createdAt" >= ${start}
        AND (p.id IS NULL OR (p."isDemo" = false AND p."invitePendingAt" IS NULL))
    )
    SELECT
      week_start,
      count(*) AS account,
      count(email_at) AS email,
      count(profile_id) AS profile,
      count(card_at) AS card,
      count(*) FILTER (WHERE card_at <= profile_at + interval '24 hours') AS card_24h,
      count(*) FILTER (WHERE card_at <= profile_at + interval '7 days') AS card_7d,
      count(fiscal_at) AS fiscal,
      count(*) FILTER (WHERE identity_ok) AS identity,
      count(*) FILTER (WHERE payments_ok) AS payments
    FROM pros
    GROUP BY week_start
    ORDER BY week_start DESC
  `;
}

const STEP_COLUMN: Record<SignupFunnelStep, keyof SignupFunnelRow> = {
  ACCOUNT: "account",
  EMAIL: "email",
  PROFILE: "profile",
  CARD: "card",
  FISCAL: "fiscal",
  IDENTITY: "identity",
  PAYMENTS: "payments",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Le righe della query in settimane e totale. */
export function buildSignupFunnel(rows: SignupFunnelRow[], from: Date | null): AdminSignupFunnel {
  const weeks: SignupFunnelWeek[] = rows.map((row) => {
    const counts = Object.fromEntries(SIGNUP_FUNNEL_STEPS.map((step) => [step, Number(row[STEP_COLUMN[step]])])) as Record<SignupFunnelStep, number>;
    // date_trunc restituisce l'ora di Roma come timestamp senza fuso: la data si legge in UTC.
    const d = row.week_start;
    return {
      weekStart: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      counts,
      cardWithin24h: Number(row.card_24h),
      cardWithin7d: Number(row.card_7d),
    };
  });
  const sum = (pick: (w: SignupFunnelWeek) => number) => weeks.reduce((acc, w) => acc + pick(w), 0);
  return {
    countingFrom: from?.toISOString() ?? null,
    weeks,
    total: {
      counts: Object.fromEntries(SIGNUP_FUNNEL_STEPS.map((step) => [step, sum((w) => w.counts[step])])) as Record<SignupFunnelStep, number>,
      cardWithin24h: sum((w) => w.cardWithin24h),
      cardWithin7d: sum((w) => w.cardWithin7d),
    },
  };
}
