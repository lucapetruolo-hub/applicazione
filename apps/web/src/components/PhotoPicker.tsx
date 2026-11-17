"use client";

import { Camera, Image as ImageIcon, Smartphone, Video } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PhoneHandoff } from "./PhoneHandoff";
import { WebcamCapture } from "./WebcamCapture";

/**
 * Scelta della foto: dal telefono un piccolo menu dal basso con "Scatta una
 * foto", "Fai un video" (se ammesso) e "Scegli dalla galleria"; dal computer
 * si apre la scelta del file (richiesta di Luca,
 * docs/changelog/2026-11-15-foto-sotto-la-descrizione.md). Serve perché su
 * Android il selettore delle foto non offre sempre la fotocamera.
 *
 * Dal computer (richieste di Luca del 16/11) si apre una finestra al centro con
 * "Scatta con la webcam" (solo se c'è una webcam,
 * docs/changelog/2026-11-16-webcam-da-computer.md), "Scatta dal telefono" col
 * codice QR (docs/changelog/2026-11-16-scatta-dal-telefono.md) e "Scegli dal
 * computer".
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
  const openerRef = useRef<HTMLButtonElement>(null);
  /** "phone": menu dal basso; "desktop": finestra al centro; "webcam": anteprima; "qr": codice per il telefono. */
  const [sheet, setSheet] = useState<null | "phone" | "desktop" | "webcam" | "qr">(null);
  const hasWebcam = useHasWebcam();

  function open() {
    if (disabled) return;
    const phone = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
    setSheet(phone ? "phone" : "desktop");
  }

  function close() {
    setSheet(null);
    openerRef.current?.focus();
  }

  function pick(input: HTMLInputElement | null) {
    setSheet(null);
    input?.click();
  }

  useEffect(() => {
    if (!sheet) return;
    if (sheet === "phone" || sheet === "desktop") firstOptionRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSheet(null);
        openerRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) onFile(file);
  };

  return (
    <>
      <button ref={openerRef} type="button" className={className} onClick={open} disabled={disabled} aria-label={label} title={label}>
        {children}
      </button>
      <input ref={galleryRef} type="file" accept={accept} hidden onChange={handleChange} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={handleChange} />
      {allowVideo ? <input ref={videoRef} type="file" accept="video/*" capture="environment" hidden onChange={handleChange} /> : null}
      {sheet
        ? createPortal(
            <div className={sheet === "phone" ? "photo-sheet-layer" : "photo-sheet-layer photo-sheet-layer-center"}>
              <button type="button" className="photo-sheet-backdrop" aria-label="Chiudi" onClick={close} />
              {sheet === "webcam" ? (
                <div className="photo-sheet photo-sheet-webcam" role="dialog" aria-modal="true" aria-label="Scatta con la webcam">
                  <WebcamCapture
                    onPhoto={(file) => {
                      close();
                      onFile(file);
                    }}
                    onChooseFile={() => pick(galleryRef.current)}
                    onClose={close}
                  />
                </div>
              ) : sheet === "qr" ? (
                <div className="photo-sheet photo-sheet-webcam" role="dialog" aria-modal="true" aria-label="Scatta dal telefono">
                  <PhoneHandoff
                    onPhoto={(file) => {
                      close();
                      onFile(file);
                    }}
                    onChooseFile={() => pick(galleryRef.current)}
                    onClose={close}
                  />
                </div>
              ) : (
                <div className="photo-sheet" role="dialog" aria-modal="true" aria-label="Aggiungi una foto">
                  {sheet === "phone" ? (
                    <>
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
                    </>
                  ) : (
                    <>
                      {hasWebcam ? (
                        <button ref={firstOptionRef} type="button" className="photo-sheet-option" onClick={() => setSheet("webcam")}>
                          <Camera size={22} strokeWidth={2} aria-hidden="true" />
                          Scatta con la webcam
                        </button>
                      ) : null}
                      <button
                        ref={hasWebcam ? undefined : firstOptionRef}
                        type="button"
                        className="photo-sheet-option"
                        onClick={() => setSheet("qr")}
                      >
                        <Smartphone size={22} strokeWidth={2} aria-hidden="true" />
                        Scatta dal telefono
                      </button>
                      <button type="button" className="photo-sheet-option" onClick={() => pick(galleryRef.current)}>
                        <ImageIcon size={22} strokeWidth={2} aria-hidden="true" />
                        {allowVideo ? "Scegli foto o video dal computer" : "Scegli dal computer"}
                      </button>
                    </>
                  )}
                  <button type="button" className="photo-sheet-cancel" onClick={close}>
                    Annulla
                  </button>
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/**
 * Se il computer ha una webcam. I browser dicono quali dispositivi ci sono
 * anche prima del permesso (senza i nomi), quindi non chiede nulla
 * all'utente. Si aggiorna se si collega o si stacca una webcam.
 */
function useHasWebcam(): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    const devices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!devices?.enumerateDevices || !devices.getUserMedia) return;
    let alive = true;
    const check = () => {
      devices
        .enumerateDevices()
        .then((list) => {
          if (alive) setHas(list.some((device) => device.kind === "videoinput"));
        })
        .catch(() => undefined);
    };
    check();
    devices.addEventListener?.("devicechange", check);
    return () => {
      alive = false;
      devices.removeEventListener?.("devicechange", check);
    };
  }, []);
  return has;
}
