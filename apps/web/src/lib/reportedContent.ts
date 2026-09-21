/**
 * Ricorda in questo browser quali contenuti (profilo, recensione, recensione
 * cliente) l'utente ha già segnalato, per disabilitare il tasto "Segnala"
 * corrispondente per 24 ore — richiesta esplicita dell'utente: "quando
 * clicchi sul pulsante di segnalazione... il sistema registra il feedback e
 * disabilita il tasto per evitare abusi di spam". Stesso pattern già in uso
 * per il consenso cookie (`CookieBanner.tsx`): `localStorage` con guardia
 * try/catch (privacy mode/quota piena non deve rompere la pagina), mai
 * l'unica fonte di verità — il backend (`ContentReportsService.create`)
 * rifiuta comunque un duplicato entro 24 ore con un 409 a prescindere da
 * cosa sa questo browser, quindi anche in un browser diverso o con
 * `localStorage` cancellato l'abuso resta bloccato lato server, solo senza
 * il feedback immediato del tasto già disabilitato.
 */
import type { ContentReportTargetType } from "@professionisti/shared";

const STORAGE_PREFIX = "reportedContent:";
const WINDOW_MS = 24 * 60 * 60 * 1000;

function storageKey(targetType: ContentReportTargetType, targetId: string): string {
  return `${STORAGE_PREFIX}${targetType}:${targetId}`;
}

export function hasRecentlyReported(targetType: ContentReportTargetType, targetId: string): boolean {
  try {
    const raw = window.localStorage.getItem(storageKey(targetType, targetId));
    if (!raw) return false;
    const reportedAt = Number(raw);
    return Number.isFinite(reportedAt) && Date.now() - reportedAt < WINDOW_MS;
  } catch {
    return false;
  }
}

export function markReported(targetType: ContentReportTargetType, targetId: string): void {
  try {
    window.localStorage.setItem(storageKey(targetType, targetId), String(Date.now()));
  } catch {
    // localStorage non disponibile: il tasto resta riattivabile su questo
    // browser, il backend blocca comunque il duplicato entro 24 ore.
  }
}
