"use client";

import { useMemo, useRef, useState } from "react";
import { ZoomIn } from "lucide-react";

const STAGE_SIZE = 280;
const OUTPUT_SIZE = 480;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;

type Offset = { x: number; y: number };

function clampOffset(offset: Offset, displayedWidth: number, displayedHeight: number): Offset {
  // L'immagine ("cover") non deve mai lasciare spazi vuoti nel riquadro: se è
  // più grande dello stage, i bordi non possono superare verso l'interno lo
  // spazio [stage - displayed, 0] — calcolato separatamente per larghezza e
  // altezza. Con un unico limite condiviso (bug reale segnalato dall'utente),
  // una foto "lunga" (verticale) ha displayedWidth == STAGE_SIZE esatto
  // (copre esattamente in larghezza) e displayedHeight > STAGE_SIZE
  // (sborda in verticale, come previsto): usare displayedWidth anche per
  // l'asse Y azzerava il range verticale, bloccando del tutto il trascinamento
  // verso il basso e impedendo di vedere la parte inferiore della foto.
  const minX = Math.min(0, STAGE_SIZE - displayedWidth);
  const minY = Math.min(0, STAGE_SIZE - displayedHeight);
  return {
    x: Math.min(0, Math.max(minX, offset.x)),
    y: Math.min(0, Math.max(minY, offset.y)),
  };
}

/**
 * Modale per riposizionare/ridimensionare l'immagine profilo prima
 * dell'upload, così l'utente può far entrare bene il soggetto nel riquadro
 * circolare (drag per spostare, slider per zoomare) invece di subire un
 * ritaglio automatico. Canvas-based, nessuna libreria esterna: web-only,
 * resta in apps/web coerente con le altre primitive DOM-specifiche già
 * presenti qui (CategoryIconBadge, ProfessionalAvatar).
 */
export function ImageCropModal({
  imageSrc,
  onCancel,
  onConfirm,
}: {
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (blob: Blob) => void;
}) {
  const imgRef = useRef<HTMLImageElement>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; offsetStart: Offset } | null>(null);

  // Scala minima che fa "coprire" (come CSS object-fit: cover) l'intero
  // riquadro quadrato con l'immagine, qualunque siano le sue proporzioni.
  const baseScale = useMemo(() => {
    if (!naturalSize) return 1;
    return Math.max(STAGE_SIZE / naturalSize.width, STAGE_SIZE / naturalSize.height);
  }, [naturalSize]);

  const displayedWidth = naturalSize ? naturalSize.width * baseScale * zoom : STAGE_SIZE;
  const displayedHeight = naturalSize ? naturalSize.height * baseScale * zoom : STAGE_SIZE;

  function handleImageLoad() {
    const img = imgRef.current;
    if (!img) return;
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    setNaturalSize({ width, height });
    const scale = Math.max(STAGE_SIZE / width, STAGE_SIZE / height);
    setOffset({ x: (STAGE_SIZE - width * scale) / 2, y: (STAGE_SIZE - height * scale) / 2 });
  }

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
      clampOffset(next, displayedWidth > 0 ? displayedWidth : STAGE_SIZE, displayedHeight > 0 ? displayedHeight : STAGE_SIZE),
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
      return clampOffset({ x: centerX, y: centerY }, nextDisplayedWidth, nextDisplayedHeight);
    });
  }

  async function handleConfirm() {
    const img = imgRef.current;
    if (!img || !naturalSize) return;
    setIsProcessing(true);
    try {
      const scale = baseScale * zoom;
      const sourceSize = STAGE_SIZE / scale;
      const sourceX = -offset.x / scale;
      const sourceY = -offset.y / scale;

      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

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
        style={{
          backgroundColor: "white",
          borderRadius: 16,
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
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Posiziona la tua immagine</h2>
          <p style={{ fontSize: 13, color: "#667085", margin: "4px 0 0" }}>
            Trascina per spostare, usa lo slider per ingrandire.
          </p>
        </div>

        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{
            position: "relative",
            width: STAGE_SIZE,
            height: STAGE_SIZE,
            overflow: "hidden",
            borderRadius: 12,
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
          {/* Maschera circolare: anteprima di come apparirà l'avatar (sempre mostrato tondo nel resto del sito). */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              boxShadow: `0 0 0 ${STAGE_SIZE}px rgba(255,255,255,0.55)`,
              borderRadius: "50%",
              pointerEvents: "none",
            }}
          />
        </div>

        <div style={{ width: "100%", display: "flex", alignItems: "center", gap: 10 }}>
          <ZoomIn size={18} strokeWidth={1.5} color="#4A525E" />
          <input
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
              borderRadius: 8,
              border: "1px solid #d0d5dd",
              backgroundColor: "white",
              fontSize: 15,
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
              borderRadius: 8,
              border: "none",
              backgroundColor: "#1e5eff",
              color: "white",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
              opacity: isProcessing || !naturalSize ? 0.6 : 1,
            }}
          >
            {isProcessing ? "Salvataggio..." : "Salva"}
          </button>
        </div>
      </div>
    </div>
  );
}
