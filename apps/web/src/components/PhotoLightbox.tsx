"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { isVideoUrl } from "@/lib/media";

/**
 * Overlay a schermo intero per aprire in grande le foto (o i video, vedi
 * isVideoUrl — richiesta esplicita dell'utente: "dai la possibilità di
 * caricare anche i video") delle recensioni o di qualunque altra galleria a
 * miniature nel sito: stesso pattern DOM grezzo di ImageCropModal, nessuna
 * libreria di lightbox aggiunta. Frecce prev/next mostrate solo se ci sono
 * più elementi.
 */
export function PhotoLightbox({
  photos,
  initialIndex,
  onClose,
}: {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initialIndex);

  // Fase 6 (accessibilità): un overlay a schermo intero senza via di uscita
  // da tastiera intrappola un utente che naviga solo con Tab/Esc — mancava
  // del tutto, l'unico modo per chiudere era il click sul backdrop o sulla X.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function showPrev(e: React.MouseEvent) {
    e.stopPropagation();
    setIndex((i) => (i - 1 + photos.length) % photos.length);
  }

  function showNext(e: React.MouseEvent) {
    e.stopPropagation();
    setIndex((i) => (i + 1) % photos.length);
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Foto ingrandita"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.9)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          borderRadius: 20,
          border: "none",
          backgroundColor: "rgba(255,255,255,0.15)",
          color: "white",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
      >
        <X size={20} strokeWidth={1.5} />
      </button>

      {photos.length > 1 ? (
        <>
          <button
            type="button"
            aria-label="Foto precedente"
            onClick={showPrev}
            style={{
              position: "absolute",
              left: 16,
              width: 44,
              height: 44,
              borderRadius: 22,
              border: "none",
              backgroundColor: "rgba(255,255,255,0.15)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <ChevronLeft size={24} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            aria-label="Foto successiva"
            onClick={showNext}
            style={{
              position: "absolute",
              right: 16,
              width: 44,
              height: 44,
              borderRadius: 22,
              border: "none",
              backgroundColor: "rgba(255,255,255,0.15)",
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
            }}
          >
            <ChevronRight size={24} strokeWidth={1.5} />
          </button>
          <div style={{ position: "absolute", bottom: 20, color: "white", fontSize: 14 }}>
            {index + 1} / {photos.length}
          </div>
        </>
      ) : null}

      {isVideoUrl(photos[index] ?? "") ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          key={photos[index]}
          src={photos[index]}
          controls
          autoPlay
          playsInline
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 8 }}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photos[index]}
          alt=""
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "90vw", maxHeight: "85vh", objectFit: "contain", borderRadius: 8 }}
        />
      )}
    </div>
  );
}
