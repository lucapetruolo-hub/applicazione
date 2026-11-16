"use client";

import { Camera, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Foto con la webcam del computer (richiesta di Luca del 16/11/2026,
 * docs/changelog/2026-11-16-webcam-da-computer.md). Si apre dentro la stessa
 * finestra di PhotoPicker: anteprima dal vivo, "Scatta", poi "Usa la foto" o
 * "Rifai". La foto esce come un file JPEG qualunque, quindi segue la stessa
 * strada di un file scelto (rimpicciolita, Turnstile, limiti di foto).
 * L'anteprima è a specchio come nelle videochiamate; la foto salvata no,
 * così una scritta sull'apparecchio si legge dritta.
 */

type Stato = "avvio" | "dal-vivo" | "scattata" | "negata" | "assente" | "occupata";

const MESSAGGI: Record<"negata" | "assente" | "occupata", { titolo: string; testo: string }> = {
  negata: {
    titolo: "La webcam è bloccata",
    testo:
      "Per scattare, permetti l'uso della fotocamera dal lucchetto accanto all'indirizzo del sito, poi riprova. Oppure scegli una foto dal computer.",
  },
  assente: {
    titolo: "Non troviamo una webcam",
    testo: "Collega una webcam e riprova, oppure scegli una foto dal computer.",
  },
  occupata: {
    titolo: "La webcam non si apre",
    testo: "Forse la sta usando un altro programma (per esempio una videochiamata). Chiudilo e riprova, oppure scegli una foto dal computer.",
  },
};

function statoDaErrore(error: unknown): "negata" | "assente" | "occupata" {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "negata";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "assente";
  return "occupata";
}

export function WebcamCapture({
  onPhoto,
  onChooseFile,
  onClose,
}: {
  onPhoto: (file: File) => void;
  /** "Scegli dal computer": chiude la webcam e apre la scelta del file. */
  onChooseFile: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotRef = useRef<Blob | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [stato, setStato] = useState<Stato>("avvio");
  const [shotUrl, setShotUrl] = useState<string | null>(null);

  const ferma = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  // Lo stato "avvio" lo mette chi richiama (Rifai, Riprova): all'apertura è già quello di partenza.
  const avvia = useCallback(async () => {
    ferma();
    if (!navigator.mediaDevices?.getUserMedia) {
      setStato("assente");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setStato("dal-vivo");
    } catch (error) {
      setStato(statoDaErrore(error));
    }
  }, [ferma]);

  useEffect(() => {
    // Accende la webcam all'apertura: lo stato cambia solo dopo la risposta del browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void avvia();
    return ferma;
  }, [avvia, ferma]);

  useEffect(() => {
    return () => {
      if (shotUrl) URL.revokeObjectURL(shotUrl);
    };
  }, [shotUrl]);

  // Il pulsante principale prende il fuoco a ogni passaggio: Invio scatta, poi Invio usa la foto.
  useEffect(() => {
    primaryRef.current?.focus();
  }, [stato]);

  function scatta() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        shotRef.current = blob;
        setShotUrl(URL.createObjectURL(blob));
        setStato("scattata");
        // La webcam si spegne appena scattata: la lucina non resta accesa mentre si guarda la foto.
        ferma();
      },
      "image/jpeg",
      0.92,
    );
  }

  function rifai() {
    shotRef.current = null;
    setShotUrl(null);
    riprova();
  }

  function riprova() {
    setStato("avvio");
    void avvia();
  }

  function usa() {
    const blob = shotRef.current;
    if (!blob) return;
    const ora = new Date();
    const nome = `webcam-${ora.getFullYear()}${String(ora.getMonth() + 1).padStart(2, "0")}${String(ora.getDate()).padStart(2, "0")}-${String(ora.getHours()).padStart(2, "0")}${String(ora.getMinutes()).padStart(2, "0")}.jpg`;
    ferma();
    onPhoto(new File([blob], nome, { type: "image/jpeg" }));
  }

  const errore = stato === "negata" || stato === "assente" || stato === "occupata" ? MESSAGGI[stato] : null;

  return (
    <div className="webcam">
      <div className="webcam-head">
        <h2 className="webcam-title">{stato === "scattata" ? "Va bene questa foto?" : "Scatta con la webcam"}</h2>
        <button type="button" className="webcam-close" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
      </div>

      {errore ? (
        <div className="webcam-error" role="alert">
          <Camera size={28} strokeWidth={2} aria-hidden="true" />
          <strong>{errore.titolo}</strong>
          <p>{errore.testo}</p>
        </div>
      ) : (
        <div className="webcam-frame">
          <video
            ref={videoRef}
            className="webcam-video"
            playsInline
            muted
            hidden={stato === "scattata"}
            aria-label="Anteprima della webcam"
          />
          {stato === "scattata" && shotUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto locale (blob:), non un'immagine da ottimizzare
            <img className="webcam-shot" src={shotUrl} alt="La foto appena scattata" />
          ) : null}
          {stato === "avvio" ? (
            <p className="webcam-wait" role="status">
              Accendo la webcam… Se il browser lo chiede, tocca &quot;Consenti&quot;.
            </p>
          ) : null}
        </div>
      )}

      {stato === "dal-vivo" ? <p className="webcam-hint">Inquadra il problema da vicino, con buona luce. Niente persone o documenti.</p> : null}

      <div className="webcam-actions">
        {stato === "scattata" ? (
          <>
            <button type="button" className="webcam-secondary" onClick={rifai}>
              <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
              Rifai
            </button>
            <button ref={primaryRef} type="button" className="webcam-primary" onClick={usa}>
              Usa la foto
            </button>
          </>
        ) : errore ? (
          <>
            {stato !== "assente" ? (
              <button type="button" className="webcam-secondary" onClick={riprova}>
                Riprova
              </button>
            ) : null}
            <button ref={primaryRef} type="button" className="webcam-primary" onClick={onChooseFile}>
              Scegli dal computer
            </button>
          </>
        ) : (
          <>
            <button type="button" className="webcam-secondary" onClick={onChooseFile}>
              Scegli dal computer
            </button>
            <button
              ref={primaryRef}
              type="button"
              className="webcam-primary"
              onClick={scatta}
              disabled={stato !== "dal-vivo"}
            >
              <Camera size={18} strokeWidth={2} aria-hidden="true" />
              Scatta
            </button>
          </>
        )}
      </div>
    </div>
  );
}
