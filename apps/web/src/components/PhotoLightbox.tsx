"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { isVideoUrl } from "@/lib/media";
import { closeOnBackdrop } from "@/lib/closeOnBackdrop";

/**
 * Overlay a schermo intero per aprire in grande le foto (o i video, vedi
 * isVideoUrl — richiesta esplicita dell'utente: "dai la possibilità di
 * caricare anche i video") delle recensioni o di qualunque altra galleria a
 * miniature nel sito: stesso pattern DOM grezzo di ImageCropModal, nessuna
 * libreria di lightbox aggiunta. Frecce prev/next mostrate solo se ci sono
 * più elementi.
 *
 * Da telefono si scorre col dito, una foto per gesto (scroll-snap con
 * `scroll-snap-stop: always`, docs/changelog/2026-10-28-micro-interazioni.md):
 * tutte le foto stanno in una riga larga quanto lo schermo e le frecce
 * scorrono la stessa riga, così il numero "2 / 5" segue sia il dito sia le
 * frecce. Anche le frecce della tastiera cambiano foto.
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
  const trackRef = useRef<HTMLDivElement>(null);

  // All'apertura la riga parte dalla foto scelta, senza animazione.
  useEffect(() => {
    const track = trackRef.current;
    if (track) track.scrollLeft = initialIndex * track.clientWidth;
  }, [initialIndex]);

  function goTo(next: number) {
    const track = trackRef.current;
    if (!track) return;
    const target = (next + photos.length) % photos.length;
    // Dall'ultima alla prima si salta senza scorrere tutta la riga.
    const wraps = Math.abs(target - index) > 1;
    track.scrollTo({ left: target * track.clientWidth, behavior: wraps ? "auto" : "smooth" });
  }

  // Fase 6 (accessibilità): un overlay a schermo intero senza via di uscita
  // da tastiera intrappola un utente che naviga solo con Tab/Esc — mancava
  // del tutto, l'unico modo per chiudere era il click sul backdrop o sulla X.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (photos.length > 1 && e.key === "ArrowLeft") goTo(index - 1);
      if (photos.length > 1 && e.key === "ArrowRight") goTo(index + 1);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  });

  function handleScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const current = Math.round(track.scrollLeft / track.clientWidth);
    if (current === index) return;
    setIndex(current);
    // Un video lasciato scorrendo non continua a suonare dietro.
    track.querySelectorAll<HTMLElement>(".lightbox-slide").forEach((slide, i) => {
      if (i !== current) slide.querySelector("video")?.pause();
    });
  }

  function showPrev(e: React.MouseEvent) {
    e.stopPropagation();
    goTo(index - 1);
  }

  function showNext(e: React.MouseEvent) {
    e.stopPropagation();
    goTo(index + 1);
  }

  return (
    <div
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
      {/* Una foto per schermata. Un clic fuori dalla foto chiude (con la
          tastiera Esc). */}
      <div ref={trackRef} className="lightbox-track" onScroll={handleScroll}>
        {photos.map((url, i) => (
          <div key={`${url}-${i}`} role="presentation" className="lightbox-slide" onClick={closeOnBackdrop(onClose)}>
            {isVideoUrl(url) ? (
              // Video caricati dagli utenti: non esistono sottotitoli da collegare.
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video
                src={url}
                controls
                autoPlay={i === initialIndex}
                playsInline
                style={{ maxWidth: "90vw", maxHeight: "85vh", borderRadius: 10 }}
              />
            ) : (
              // `<img>` grezzo deliberato, non `next/image`: la foto può avere
              // qualunque aspect ratio (caricata dall'utente, mai tracciata nel
              // modello dati) — `maxWidth`/`maxHeight` + `objectFit: contain`
              // si affidano al dimensionamento intrinseco nativo del browser,
              // che `next/image` richiederebbe di conoscere in anticipo
              // (width/height espliciti o `fill` con contenitore già dimensionato).
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={url}
                alt={photos.length > 1 ? `Foto ${i + 1} di ${photos.length}` : ""}
                loading={Math.abs(i - initialIndex) > 1 ? "lazy" : undefined}
                style={{ maxWidth: "90vw", maxHeight: "85vh", objectFit: "contain", borderRadius: 10 }}
              />
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        aria-label="Chiudi"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 1,
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
              zIndex: 1,
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
              zIndex: 1,
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
          <div aria-live="polite" style={{ position: "absolute", bottom: 20, zIndex: 1, color: "white", fontSize: 16, pointerEvents: "none" }}>
            {index + 1} / {photos.length}
          </div>
        </>
      ) : null}

    </div>
  );
}
