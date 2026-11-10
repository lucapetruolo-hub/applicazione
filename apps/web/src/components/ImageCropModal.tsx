"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useDialogFocus } from "@/lib/useDialogFocus";
import { ZoomIn } from "lucide-react";
import { brand } from "@professionisti/ui";
import { ButtonWaitBar } from "@/components/WaitBar";

const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Offset = { x: number; y: number };

/**
 * "portrait": la foto del professionista, verticale 3:4 con gli angoli
 * arrotondati come nelle schede della ricerca (CARD_PHOTO in
 * ProfessionalAvatar.tsx: 120×160 con angoli di 20 px, qui in scala 2:1).
 * "circle": la foto dell'account, mostrata tonda nel resto del sito.
 */
export type ImageCropShape = "portrait" | "circle";

type CropFormat = { stageWidth: number; stageHeight: number; outputWidth: number; outputHeight: number; radius: number | string };

const CROP_FORMATS: Record<ImageCropShape, CropFormat> = {
  // 600×800: entro il limite di 800 px di Cloudinary, quindi nessun
  // ridimensionamento in più sul server.
  portrait: { stageWidth: 240, stageHeight: 320, outputWidth: 600, outputHeight: 800, radius: 40 },
  circle: { stageWidth: 280, stageHeight: 280, outputWidth: 480, outputHeight: 480, radius: "50%" },
};

function clampOffset(offset: Offset, displayedWidth: number, displayedHeight: number, stageWidth: number, stageHeight: number): Offset {
  // L'immagine ("cover") non deve mai lasciare spazi vuoti nel riquadro: se è
  // più grande dello stage, i bordi non possono superare verso l'interno lo
  // spazio [stage - displayed, 0] — calcolato separatamente per larghezza e
  // altezza. Con un unico limite condiviso (bug reale segnalato dall'utente),
  // una foto "lunga" (verticale) ha displayedWidth uguale alla larghezza del riquadro
  // (copre esattamente in larghezza) e displayedHeight più alta del riquadro
  // (sborda in verticale, come previsto): usare displayedWidth anche per
  // l'asse Y azzerava il range verticale, bloccando del tutto il trascinamento
  // verso il basso e impedendo di vedere la parte inferiore della foto.
  const minX = Math.min(0, stageWidth - displayedWidth);
  const minY = Math.min(0, stageHeight - displayedHeight);
  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  };
}

/**
 * Modale per riposizionare/ridimensionare l'immagine profilo prima
 * dell'upload, così l'utente può far entrare bene il soggetto nel riquadro
 * (verticale per i professionisti, tondo per l'account; drag per spostare,
 * slider per zoomare) invece di subire un
 * ritaglio automatico. Canvas-based, nessuna libreria esterna: web-only,
 * resta in apps/web coerente con le altre primitive DOM-specifiche già
 * presenti qui (CategoryIconBadge, ProfessionalAvatar).
 */
export function ImageCropModal({
  imageSrc,
  shape = "circle",
  onCancel,
  onConfirm,
}: {
  imageSrc: string;
  shape?: ImageCropShape;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const { stageWidth, stageHeight, outputWidth, outputHeight, radius } = CROP_FORMATS[shape];
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; offsetStart: Offset } | null>(null);
  const titleId = useId();
  const stageRef = useRef<HTMLDivElement>(null);

  // Finestra vera anche per tastiera e lettore di schermo (collaudo C-23,
  // docs/changelog/2026-10-30-tastiera.md): il fuoco entra nel riquadro
  // della foto, Esc annulla.
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(dialogRef, onCancel);

  // Le frecce spostano la foto come il trascinamento (10 px, 40 con Maiusc).
  function handleStageKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 40 : 10;
    const delta = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } }[e.key];
    if (!delta) return;
    e.preventDefault();
    setOffset((prev) =>
      clampOffset({ x: prev.x + delta.x, y: prev.y + delta.y }, displayedWidth > 0 ? displayedWidth : stageWidth, displayedHeight > 0 ? displayedHeight : stageHeight, stageWidth, stageHeight),
    );
  }

  // Scala minima che fa "coprire" (come CSS object-fit: cover) l'intero
  // riquadro con l'immagine, qualunque siano le sue proporzioni.
  const baseScale = useMemo(() => {
    if (!naturalSize) return 1;
    return Math.max(stageWidth / naturalSize.width, stageHeight / naturalSize.height);
  }, [naturalSize, stageWidth, stageHeight]);

  const displayedWidth = naturalSize ? naturalSize.width * baseScale * zoom : stageWidth;
  const displayedHeight = naturalSize ? naturalSize.height * baseScale * zoom : stageHeight;

  function handleImageLoad() {
    const img = imgRef.current;
    if (!img) return;
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    setNaturalSize({ width, height });
    const scale = Math.max(stageWidth / width, stageHeight / height);
    setOffset({ x: (stageWidth - width * scale) / 2, y: (stageHeight - height * scale) / 2 });
  }

  // Un'immagine già in memoria può finire di caricarsi prima che React
  // colleghi `onLoad`: senza misure il riquadro resterebbe schiacciato e
  // "Salva" spento.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth > 0) handleImageLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePointerDown(e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, offsetStart: offset };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    const next = {
      x: dragState.current.offsetStart.x + dx,
      y: dragState.current.offsetStart.y + dy,
    };
    setOffset(
      clampOffset(next, displayedWidth > 0 ? displayedWidth : stageWidth, displayedHeight > 0 ? displayedHeight : stageHeight, stageWidth, stageHeight),
    );
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  function handleZoomChange(nextZoom: number) {
    setZoom(nextZoom);
    if (!naturalSize) return;
    const nextDisplayedWidth = naturalSize.width * baseScale * nextZoom;
    const nextDisplayedHeight = naturalSize.height * baseScale * nextZoom;
    // Riancora al centro dell'inquadratura corrente invece di rifissare lo
    // zoom sull'angolo in alto a sinistra, così lo zoom "sembra" centrato.
    setOffset((prev) => {
      const centerX = prev.x - (nextDisplayedWidth - displayedWidth) / 2;
      const centerY = prev.y - (nextDisplayedHeight - displayedHeight) / 2;
      return clampOffset({ x: centerX, y: centerY }, nextDisplayedWidth, nextDisplayedHeight, stageWidth, stageHeight);
    });
  }

  async function handleConfirm() {
    const img = imgRef.current;
    if (!img || !naturalSize) return;
    setIsProcessing(true);
    try {
      const scale = baseScale * zoom;
      const sourceWidth = stageWidth / scale;
      const sourceHeight = stageHeight / scale;
      const sourceX = -offset.x / scale;
      const sourceY = -offset.y / scale;

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, outputWidth, outputHeight);

      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92));
      if (blob) onConfirm(blob);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(15, 23, 42, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          backgroundColor: "white",
          borderRadius: 20,
          padding: 24,
          width: "100%",
          maxWidth: 380,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          alignItems: "center",
        }}
      >
        <div style={{ width: "100%" }}>
          <h2 id={titleId} style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Posiziona la tua immagine</h2>
          <p style={{ fontSize: 16, color: "#667085", margin: "4px 0 0" }}>
            Trascina o usa le frecce per spostare, la barra per ingrandire.
          </p>
        </div>

        {/* Riquadro in cui si sposta la foto con trascinamento o frecce:
            non esiste un elemento HTML "vero" per un movimento in due direzioni. */}
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex, jsx-a11y/no-noninteractive-element-interactions */}
        <div ref={stageRef} tabIndex={0} data-autofocus
          role="application"
          aria-roledescription="riquadro della foto"
          aria-label="Foto da posizionare: usa le frecce per spostarla"
          onKeyDown={handleStageKeyDown}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            position: "relative",
            width: stageWidth,
            height: stageHeight,
            overflow: "hidden",
            borderRadius: shape === "portrait" ? radius : 20,
            backgroundColor: "#f1f5f9",
            cursor: "grab",
            touchAction: "none",
          }}
        >
          {/* `<img>` grezzo deliberato, non `next/image`: `imageSrc` è un
              `blob:`/data URL locale (il file appena scelto, prima
              dell'upload — non supportato dal loader di `next/image`), e
              serve un `ref` diretto su un vero elemento DOM per leggere
              `naturalWidth`/`naturalHeight` in `handleImageLoad` (usati per
              la matematica di drag/zoom del ritaglio). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={imageSrc}
            alt=""
            onLoad={handleImageLoad}
            draggable={false}
            style={{
              position: "absolute",
              left: offset.x,
              top: offset.y,
              width: displayedWidth,
              height: displayedHeight,
              maxWidth: "none",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
          {/* Foto verticale: il riquadro stesso ha la forma della scheda nella
              ricerca. Foto tonda: maschera circolare, fuori resta velato. */}
          {shape === "circle" ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                boxShadow: `0 0 0 ${stageWidth}px rgba(255,255,255,0.55)`,
                borderRadius: radius,
                pointerEvents: "none",
              }}
            />
          ) : null}
        </div>

        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 10 }}>
          <ZoomIn size={18} strokeWidth={1.5} color="#4A525E" />
          <input aria-label="Zoom"
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            onChange={(e) => handleZoomChange(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>

        <div style={{ width: "100%", display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid #d0d5dd",
              backgroundColor: "white",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Annulla
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isProcessing || !naturalSize}
            style={{
              flex: 1,
              padding: "10px 16px",
              borderRadius: 10,
              border: "none",
              backgroundColor: brand.cianografiaPieno,
              color: "white",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
              opacity: !isProcessing && !naturalSize ? 0.6 : 1,
            }}
          >
            Salva
            {isProcessing ? <ButtonWaitBar label="Salvataggio…" /> : null}
          </button>
        </div>
      </div>
    </div>
  );
}
