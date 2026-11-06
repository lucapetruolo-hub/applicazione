import type { Prisma } from "@professionisti/database";
import { publicVisibilityWhere } from "../professional-fiscal/public-visibility";
import { COUNTED_USER, countingFrom } from "../site-counts/counted";

/**
 * Professionisti che possono comparire nella ricerca. Un professionista che
 * ha eliminato l'account non deve mai ricomparire (soft-delete, vedi
 * AuthService.deleteAccount), né uno sospeso da un admin (docs/CHANGELOG.md
 * §144), né uno in pausa per l'abbonamento (§162), né uno creato da un
 * operatore e non ancora confermato (§170), né uno bloccato per la 3ª
 * segnalazione accolta in 30 giorni (§167). Va insieme a
 * `publicVisibilityWhere()` (dati fiscali, §241).
 */
export function searchableProfileWhere(): Prisma.ProfessionalProfileWhereInput {
  return {
    deletedAt: null,
    suspendedAt: null,
    pausedAt: null,
    invitePendingAt: null,
  };
}

/**
 * Le condizioni di `searchableProfileWhere` che vanno nell'AND (ognuna è un
 * OR): bloccato per segnalazioni (§167) o in pausa per scelta sua (collaudo
 * C-16). Separate perché chi usa la ricerca ha già un suo AND.
 */
export function searchableProfileConditions(now = new Date()): Prisma.ProfessionalProfileWhereInput[] {
  return [
    { OR: [{ requestsBlockedUntil: null }, { requestsBlockedUntil: { lte: now } }] },
    { OR: [{ awayUntil: null }, { awayUntil: { lte: now } }] },
  ];
}

/**
 * Profili veri visibili nella ricerca, senza categoria né vetrine demo: li
 * usa il catalogo dei servizi per l'intelligenza artificiale
 * (docs/changelog/2026-11-06-ia-conosce-i-servizi.md). Stesse regole di
 * `publicSearchWhere` in ProfessionalsService.
 */
export function publicRealProfilesWhere(now = new Date()): Prisma.ProfessionalProfileWhereInput {
  return {
    ...searchableProfileWhere(),
    AND: [...searchableProfileConditions(now), publicVisibilityWhere()],
    isDemo: false,
    ...(countingFrom(now) ? { user: COUNTED_USER } : {}),
  };
}
