"use client";

import { Camera, Image as ImageIcon, Video } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Scelta della foto: dal telefono un piccolo menu dal basso con "Scatta una
 * foto", "Fai un video" (se ammesso) e "Scegli dalla galleria"; dal computer
 * si apre subito la scelta del file (richiesta di Luca,
 * docs/changelog/2026-11-15-foto-sotto-la-descrizione.md). Serve perché su
 * Android il selettore delle foto non offre sempre la fotocamera.
 */
export function PhotoPicker({
  accept,
  allowVideo = false,
  disabled = false,
  onFile,
  className,
  label,
  children,
}: {
  /** Tipi ammessi dalla galleria. */
  accept: string;
  allowVideo?: boolean;
  disabled?: boolean;
  onFile: (file: File) => void;
  /** Classe e nome accessibile del pulsante che apre la scelta. */
  className: string;
  label: string;
  /** Contenuto del pulsante (icona e scritta). */
  children: ReactNode;
}) {
  const galleryRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const firstOptionRef = useRef<HTMLButtonElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  function open() {
    if (disabled) return;
    const phone = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    if (phone) setSheetOpen(true);
    else galleryRef.current?.click();
  }

  function pick(input: HTMLInputElement | null) {
    setSheetOpen(false);
    input?.click();
  }

  useEffect(() => {
    if (!sheetOpen) return;
    firstOptionRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFile(file);
  };

  return (
    <>
      <button type="button" className={className} onClick={open} disabled={disabled} aria-label={label} title={label}>
        {children}
      </button>
      <input ref={galleryRef} type="file" accept={accept} hidden onChange={handleChange} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleChange} />
      {allowVideo ? <input ref={videoRef} type="file" accept="video/*" capture="environment" hidden onChange={handleChange} /> : null}
      {sheetOpen
        ? createPortal(
            <div className="photo-sheet-layer">
              <button type="button" className="photo-sheet-backdrop" aria-label="Chiudi" onClick={() => setSheetOpen(false)} />
              <div className="photo-sheet" role="dialog" aria-modal="true" aria-label="Aggiungi una foto">
                <button ref={firstOptionRef} type="button" className="photo-sheet-option" onClick={() => pick(cameraRef.current)}>
                  <Camera size={22} strokeWidth={2} aria-hidden="true" />
                  Scatta una foto
                </button>
                {allowVideo ? (
                  <button type="button" className="photo-sheet-option" onClick={() => pick(videoRef.current)}>
                    <Video size={22} strokeWidth={2} aria-hidden="true" />
                    Fai un video
                  </button>
                ) : null}
                <button type="button" className="photo-sheet-option" onClick={() => pick(galleryRef.current)}>
                  <ImageIcon size={22} strokeWidth={2} aria-hidden="true" />
                  Scegli dalla galleria
                </button>
                <button type="button" className="photo-sheet-cancel" onClick={() => setSheetOpen(false)}>
                  Annulla
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
