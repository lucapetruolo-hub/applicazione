import type { RealtimeEvent } from "@professionisti/shared";

/**
 * Bus pub/sub lato client per i push in tempo reale (CTO — "socket.io vs
 * websocket vs alternative", scelta SSE): `AuthContext` possiede l'unica
 * connessione `EventSource` dell'app (un professionista/cliente ha sempre
 * un solo canale, non uno per componente montato) e inoltra ogni messaggio
 * qui — qualunque componente (una `ConversationView` aperta, l'inbox
 * `/chat`) si iscrive senza bisogno di prop-drilling attraverso l'albero
 * dei componenti. Nessuna libreria: un `Set` di listener basta per questa
 * scala.
 */
type Listener = (event: RealtimeEvent) => void;

const listeners = new Set<Listener>();

export function emitRealtimeEvent(event: RealtimeEvent): void {
  for (const listener of listeners) listener(event);
}

/** Ritorna una funzione di cleanup — da chiamare nel return di un `useEffect`. */
export function subscribeRealtimeEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
