"use client";

import { Camera, CheckCircle2, Image as ImageIcon, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { apiClient } from "@/lib/apiClient";
import { localPreviewUrl } from "@/lib/media";
import { shrinkPhoto } from "@/lib/photoSearch";

type Stato = "apro" | "pronto" | "anteprima" | "invio" | "fatto" | "scaduto";

/**
 * Il telefono scatta (o sceglie dalla galleria), vede la foto e la manda al
 * computer. La foto si rimpicciolisce qui e perde la posizione GPS prima di
 * partire, come nella ricerca con foto.
 */
export function ScattaDalTelefono({ code }: { code: string }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [stato, setStato] = useState<Stato>("apro");
  const [foto, setFoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiClient
      .openPhotoHandoff(code)
      .then((result) => {
        if (!alive) return;
        setStato(result.status === "opened" ? "pronto" : result.status === "sent" ? "fatto" : "scaduto");
      })
      .catch(() => {
        if (!alive) return;
        // Senza risposta si prova lo stesso: l'invio dirà se il codice vale.
        setStato("pronto");
      });
    return () => {
      alive = false;
    };
  }, [code]);

  useEffect(() => {
    return () => {
      if (foto) URL.revokeObjectURL(foto.url);
    };
  }, [foto]);

  async function scelta(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setErrore(null);
    try {
      const blob = await shrinkPhoto(file);
      setFoto({ blob, url: localPreviewUrl(new File([blob], "foto.jpg", { type: "image/jpeg" })) });
      setStato("anteprima");
    } catch {
      setErrore("Non riusciamo ad aprire questa foto. Prova a scattarne un'altra.");
    }
  }

  async function manda() {
    if (!foto) return;
    setStato("invio");
    setErrore(null);
    try {
      await apiClient.sendPhotoHandoff(code, foto.blob);
      setStato("fatto");
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 410) setStato("scaduto");
      else if (status === 409) setStato("fatto");
      else {
        setStato("anteprima");
        setErrore(error instanceof Error ? error.message : "Non riusciamo a mandare la foto. Riprova.");
      }
    }
  }

  function rifai() {
    setFoto(null);
    setStato("pronto");
  }

  return (
    <div className="scatta-page">
      <div className="scatta-card">
        {stato === "fatto" ? (
          <div className="scatta-done" role="status">
            <CheckCircle2 size={48} strokeWidth={2} aria-hidden="true" />
            <h1 className="scatta-title">Fatto, la foto è sul computer</h1>
            <p className="scatta-text">Torna al computer per continuare. Puoi chiudere questa pagina.</p>
          </div>
        ) : stato === "scaduto" ? (
          <div className="scatta-done scatta-expired" role="alert">
            <h1 className="scatta-title">Questo codice è scaduto</h1>
            <p className="scatta-text">
              Il codice vale 10 minuti e per una sola foto. Dal computer apri di nuovo &quot;Scatta dal telefono&quot; e inquadra il codice nuovo.
            </p>
          </div>
        ) : (
          <>
            <h1 className="scatta-title">{stato === "anteprima" || stato === "invio" ? "Va bene questa foto?" : "Scatta la foto del problema"}</h1>
            {foto && (stato === "anteprima" || stato === "invio") ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- foto locale (blob:), non un'immagine da ottimizzare */}
                <img className="scatta-preview" src={foto.url} alt="La foto da mandare al computer" />
                <div className="scatta-actions">
                  <button type="button" className="webcam-primary scatta-wide" onClick={() => void manda()} disabled={stato === "invio"}>
                    {stato === "invio" ? "Mando la foto…" : "Manda al computer"}
                  </button>
                  <button type="button" className="webcam-secondary scatta-wide" onClick={rifai} disabled={stato === "invio"}>
                    <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
                    Rifai
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="scatta-text">Inquadra il problema da vicino, con buona luce. Niente persone o documenti. La foto arriva da sola sul computer.</p>
                <div className="scatta-actions">
                  <button type="button" className="webcam-primary scatta-wide" onClick={() => cameraRef.current?.click()} disabled={stato === "apro"}>
                    <Camera size={20} strokeWidth={2} aria-hidden="true" />
                    Scatta una foto
                  </button>
                  <button type="button" className="webcam-secondary scatta-wide" onClick={() => galleryRef.current?.click()} disabled={stato === "apro"}>
                    <ImageIcon size={20} strokeWidth={2} aria-hidden="true" />
                    Scegli dalla galleria
                  </button>
                </div>
              </>
            )}
            {errore ? (
              <p className="scatta-error" role="alert">
                {errore}
              </p>
            ) : null}
          </>
        )}
      </div>
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => void scelta(event)} />
      <input ref={galleryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(event) => void scelta(event)} />
    </div>
  );
}
