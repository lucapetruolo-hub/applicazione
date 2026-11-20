"use client";

/**
 * Video più lungo di un minuto: non si butta via, sceglie chi lo carica
 * (richiesta di Luca, docs/changelog/2026-11-19-video-lungo-due-scelte.md).
 * Il taglio al primo minuto lo fa Cloudinary al caricamento. Stesso box nella
 * richiesta, in "Le mie richieste" e in chat
 * (docs/changelog/2026-11-20-video-lungo-anche-in-chat.md).
 */
export function VideoTooLongChoice({
  duration,
  recipient = "al professionista",
  onKeep,
  onRetake,
}: {
  /** Già in parole: "1 minuto e 23 secondi". */
  duration: string;
  /** A chi arriva il video: in chat può essere il cliente. */
  recipient?: string;
  onKeep: () => void;
  onRetake: () => void;
}) {
  return (
    <div className="guided-video-choice" role="alert" data-testid="video-troppo-lungo">
      <p>
        <strong>Il video dura {duration}: il massimo è 1 minuto.</strong> Puoi tenerlo, {recipient} arriva solo il primo minuto.
      </p>
      <div>
        <button type="button" className="guided-video-choice-keep" onClick={onKeep}>
          Tieni il primo minuto
        </button>
        <button type="button" onClick={onRetake}>
          Rifai il video
        </button>
      </div>
    </div>
  );
}
