import {
  SUSPICIOUS_ARCHIVE_KEEP_DAYS,
  SUSPICIOUS_NO_ACTION_EXPIRY_DAYS,
  adviseSuspiciousUser,
  hasNewSignals,
  signalKey,
  type AdminSignalArchiveReason,
  type AdminSignalRole,
  type AdminUserSignal,
} from "@professionisti/shared";

/**
 * Archivio degli account sospetti (docs/changelog/2026-10-30-admin-persone.md,
 * richiesta di Luca del 02/11/2026): cosa fa il controllo del mattino con ogni
 * account, senza toccare il database, così si prova con i test.
 * - Misura presa (account sospeso, profilo tolto dalla ricerca): "Gestito".
 * - Segnali spariti (es. recensione nascosta, account chiuso): "Segnali spariti".
 * - "Nessuna azione" senza novità per 90 giorni: esce da sola.
 * - Un archiviato torna da gestire se compare un segnale nuovo, tranne quando
 *   la misura è ancora in vigore.
 * - Gli archiviati da più di 2 anni si cancellano.
 */
export type StoredSuspicious = {
  userId: string;
  signals: AdminUserSignal[];
  archiveReason: AdminSignalArchiveReason | null;
  archivedAt: Date | null;
  archivedKeys: string[];
  lastChangedAt: Date;
};

export type SuspiciousPlan =
  | { userId: string; action: "UPSERT"; signals: AdminUserSignal[]; lastChangedAt: Date; isNew: boolean }
  | { userId: string; action: "ARCHIVE"; signals: AdminUserSignal[]; lastChangedAt: Date; reason: AdminSignalArchiveReason; keys: string[]; isNew: boolean }
  | { userId: string; action: "REOPEN"; signals: AdminUserSignal[]; lastChangedAt: Date }
  | { userId: string; action: "DELETE" };

const DAY_MS = 24 * 60 * 60 * 1000;
const MEASURES: AdminSignalArchiveReason[] = ["SUSPENDED", "PROFILE_HIDDEN"];

const sameKeys = (a: AdminUserSignal[], b: AdminUserSignal[]) => {
  const x = a.map(signalKey).sort().join("\n");
  const y = b.map(signalKey).sort().join("\n");
  return x === y;
};

export function planSuspicious(input: {
  stored: StoredSuspicious[];
  signals: Map<string, AdminUserSignal[]>;
  people: Map<string, { role: AdminSignalRole }>;
  /** Misura in vigore oggi per chi ha segnali (account sospeso o profilo tolto dalla ricerca). */
  measures: Map<string, "SUSPENDED" | "PROFILE_HIDDEN">;
  now: Date;
}): SuspiciousPlan[] {
  const { stored, signals, people, measures, now } = input;
  const plans: SuspiciousPlan[] = [];
  const byId = new Map(stored.map((row) => [row.userId, row]));

  for (const row of stored) {
    if (signals.has(row.userId)) continue;
    if (row.archiveReason) {
      if (row.archivedAt && now.getTime() - row.archivedAt.getTime() > SUSPICIOUS_ARCHIVE_KEEP_DAYS * DAY_MS) plans.push({ userId: row.userId, action: "DELETE" });
      continue;
    }
    // Segnali spariti: resta in archivio con gli ultimi segnali, per i precedenti.
    plans.push({ userId: row.userId, action: "ARCHIVE", signals: row.signals, lastChangedAt: row.lastChangedAt, reason: "RESOLVED", keys: row.signals.map(signalKey), isNew: false });
  }

  for (const [userId, current] of signals) {
    const row = byId.get(userId);
    const changed = !row || !sameKeys(row.signals, current);
    const lastChangedAt = changed ? now : row!.lastChangedAt;
    const measure = measures.get(userId);
    const keys = current.map(signalKey);

    if (row?.archiveReason) {
      const measureStill = MEASURES.includes(row.archiveReason) && measure !== undefined;
      if (!measureStill && hasNewSignals(current, row.archivedKeys)) {
        plans.push({ userId, action: "REOPEN", signals: current, lastChangedAt });
      } else {
        plans.push({ userId, action: "UPSERT", signals: current, lastChangedAt, isNew: false });
      }
      continue;
    }
    if (measure) {
      plans.push({ userId, action: "ARCHIVE", signals: current, lastChangedAt, reason: measure, keys, isNew: !row });
      continue;
    }
    const role = people.get(userId)?.role ?? "CLIENT";
    const quiet = now.getTime() - lastChangedAt.getTime() > SUSPICIOUS_NO_ACTION_EXPIRY_DAYS * DAY_MS;
    if (row && quiet && adviseSuspiciousUser(role, current).level === "BASSA") {
      plans.push({ userId, action: "ARCHIVE", signals: current, lastChangedAt, reason: "EXPIRED", keys, isNew: false });
      continue;
    }
    plans.push({ userId, action: "UPSERT", signals: current, lastChangedAt, isNew: !row });
  }
  return plans;
}
