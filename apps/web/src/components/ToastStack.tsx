"use client";

import { useRouter } from "next/navigation";
import { Icon, brand } from "@professionisti/ui";
import { useAuth } from "@/lib/AuthContext";
import { notificationDeepLink } from "@/lib/notificationSections";
import { notificationTopicStyle } from "@/lib/notificationTopicStyle";

function ToastCard({
  id,
  message,
  type,
  payload,
  isProfessional,
  onDismiss,
  onOpen,
}: {
  id: string;
  message: string;
  type: string;
  payload: unknown;
  isProfessional: boolean;
  onDismiss: (id: string) => void;
  onOpen: (type: string, payload: unknown) => void;
}) {
  // Niente sparizione automatica (richiesta esplicita dell'utente): il
  // banner resta finché non viene aperto o chiuso con la "x".
  const destination = notificationDeepLink(type, payload);
  // Titolo, icona e colore dell'argomento (docs/CHANGELOG.md §152).
  const topic = notificationTopicStyle(type, isProfessional);
  const aggregated = id.startsWith("batch-");

  return (
    <div className="toast-card" role="status" style={{ borderLeftColor: topic.color }}>
      <button
        type="button"
        className="toast-card-body"
        onClick={() => {
          if (destination) onOpen(type, payload);
          onDismiss(id);
        }}
        aria-label={destination ? `${message} — apri` : `${message} — chiudi`}
      >
        <span className="toast-card-icon" style={{ background: topic.tint }}>
          <Icon name={aggregated ? "bell-ring" : topic.icon} size={18} color={aggregated ? brand.grafite : topic.color} />
        </span>
        <span className="toast-card-text">
          <span className="toast-card-title" style={{ color: aggregated ? brand.grafite70 : topic.color }}>
            {aggregated ? "Aggiornamenti" : topic.title}
          </span>
          <span className="toast-card-message">{message}</span>
          {destination ? <span className="toast-card-cta">Apri →</span> : null}
        </span>
      </button>
      <button type="button" className="toast-card-close" onClick={() => onDismiss(id)} aria-label="Chiudi la notifica">
        <Icon name="x" size={16} color={brand.grafite70} />
      </button>
    </div>
  );
}

/** Popup visibili insieme: oltre, un riepilogo "+N altre" (niente muro di avvisi). */
const MAX_VISIBLE_TOASTS = 3;

/**
 * Popup "toast" per nuove notifiche (richiesta esplicita dell'utente:
 * "Fantastico, hai ricevuto un nuovo preventivo" / "Wow, hanno accettato
 * un tuo preventivo") — pila in alto al centro, si accumula se arrivano
 * più eventi ravvicinati. Resta a schermo finché non viene aperto (click
 * sul corpo, naviga all'aggiornamento) o chiuso esplicitamente con la "x"
 * — mai una sparizione automatica (richiesta esplicita dell'utente: 6s
 * erano troppo pochi per accorgersene e capire di cosa si trattava).
 * Montato una sola volta nel layout globale (come SiteHeader): i toast
 * restano visibili durante la navigazione tra pagine, non solo su
 * dashboard/le-mie-richieste.
 */
export function ToastStack() {
  const { toasts, dismissToast, user } = useAuth();
  const router = useRouter();

  if (toasts.length === 0) return null;

  function openNotification(type: string, payload: unknown) {
    const destination = notificationDeepLink(type, payload);
    if (!destination) return;
    router.push(destination);
  }

  const visible = toasts.slice(-MAX_VISIBLE_TOASTS);
  const hidden = toasts.length - visible.length;

  // In alto a destra sotto l'header su desktop, in alto al centro su
  // telefono (`.toast-stack` in globals.css); animazione d'ingresso dall'alto.
  return (
    <div className="toast-stack" aria-live="polite">
      {hidden > 0 ? (
        <button type="button" className="toast-more" onClick={() => toasts.slice(0, hidden).forEach((t) => dismissToast(t.id))}>
          +{hidden} {hidden === 1 ? "altra notifica" : "altre notifiche"} · chiudi
        </button>
      ) : null}
      {visible.map((toast) => (
        <ToastCard
          key={toast.id}
          id={toast.id}
          message={toast.message}
          type={toast.type}
          payload={toast.payload}
          isProfessional={!!user?.isProfessional}
          onDismiss={dismissToast}
          onOpen={openNotification}
        />
      ))}
    </div>
  );
}
