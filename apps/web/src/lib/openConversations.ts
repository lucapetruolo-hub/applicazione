/**
 * Conversazioni aperte a schermo in questo momento (docs/CHANGELOG.md §332):
 * un messaggio nuovo lì compare già nella chat, quindi niente popup né
 * suono. Un contatore per coppia richiesta+professionista, perché la stessa
 * chat può essere montata due volte (elenco e finestra).
 */
const openCounts = new Map<string, number>();

const keyOf = (guidedRequestId: string, professionalProfileId: string) => `${guidedRequestId}:${professionalProfileId}`;

/** Da chiamare in un `useEffect` della chat aperta: ritorna la funzione di pulizia. */
export function markConversationOpen(guidedRequestId: string, professionalProfileId: string): () => void {
  const key = keyOf(guidedRequestId, professionalProfileId);
  openCounts.set(key, (openCounts.get(key) ?? 0) + 1);
  return () => {
    const count = (openCounts.get(key) ?? 1) - 1;
    if (count <= 0) openCounts.delete(key);
    else openCounts.set(key, count);
  };
}

/** La chat è aperta e la scheda del browser è in primo piano? */
export function isConversationOnScreen(guidedRequestId: string, professionalProfileId: string): boolean {
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return false;
  return openCounts.has(keyOf(guidedRequestId, professionalProfileId));
}
