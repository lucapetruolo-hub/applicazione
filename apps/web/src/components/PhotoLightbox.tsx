"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * Overlay a schermo intero per aprire in grande le foto delle recensioni
 * (o di qualunque altra galleria a miniature nel sito): stesso pattern DOM
 * grezzo di ImageCropModal, nessuna libreria di lightbox aggiunta. Frecce
 * prev/next mostrate solo se ci sono più foto.
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

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photos[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "90vw", maxHeight: "85vh", objectFit: "contain", borderRadius: 8 }}
      />
    </div>
  );
}
