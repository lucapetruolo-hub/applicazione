"use client";

import { CheckCircle2, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/apiClient";

/**
 * "Scatta dal telefono" nella finestra foto del computer (richiesta di Luca del
 * 16/11/2026, docs/changelog/2026-11-16-scatta-dal-telefono.md): un codice QR,
 * il telefono lo inquadra, scatta e la foto arriva qui da sola. Il computer
 * chiede ogni 2,5 secondi se è arrivata; il codice vale 10 minuti.
 * Dal 17/11 (docs/changelog/2026-11-17-piu-foto-dal-telefono.md) un codice può
 * valere più foto: nella richiesta e nel portfolio si mandano una dopo l'altra
 * e arrivano qui man mano; nella ricerca della home resta una sola.
 * Chiudendo la finestra il codice e le foto non prese si cancellano.
 */

const POLL_MS = 2500;

type Stato = "creo" | "attesa" | "collegato" | "scaduto" | "errore";

export function PhoneHandoff({
  maxPhotos = 1,
  onPhoto,
  onDone,
  onChooseFile,
  onClose,
}: {
  /** Quante foto può mandare il telefono con questo codice. */
  maxPhotos?: number;
  /** Ogni foto arrivata, appena arriva. */
  onPhoto: (file: File) => void;
  /** Tutte le foto arrivate (o "Fatto"): la finestra si chiude. */
  onDone: () => void;
  /** "Scegli dal computer" se il codice non si riesce a preparare. */
  onChooseFile: () => void;
  onClose: () => void;
}) {
  // Fissato all'apertura: mentre arrivano le foto i posti liberi calano, ma il codice resta lo stesso.
  const [max] = useState(() => Math.max(1, Math.min(10, Math.floor(maxPhotos) || 1)));
  const [arrivate, setArrivate] = useState(0);
  const arrivateRef = useRef(0);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  // Sempre l'ultima funzione, senza far ripartire il giro delle domande a ogni disegno.
  const onPhotoRef = useRef(onPhoto);
  useEffect(() => {
    onPhotoRef.current = onPhoto;
  }, [onPhoto]);
  const [stato, setStato] = useState<Stato>("creo");
  const [qr, setQr] = useState<{ src: string; url: string } | null>(null);
  /** Ogni nuovo codice ha un numero: la risposta di un codice vecchio si scarta (e si cancella). */
  const generationRef = useRef(0);
  const [errore, setErrore] = useState<string | null>(null);
  const handoffRef = useRef<{ code: string; key: string } | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const chiudiCodice = useCallback(() => {
    generationRef.current += 1;
    const handoff = handoffRef.current;
    handoffRef.current = null;
    if (handoff) void apiClient.cancelPhotoHandoff(handoff.code, handoff.key);
  }, []);

  const nuovoCodice = useCallback(async () => {
    chiudiCodice();
    const generation = generationRef.current;
    try {
      const created = await apiClient.createPhotoHandoff(max);
      if (generation !== generationRef.current) {
        // La finestra si è chiusa o ha chiesto un altro codice nel frattempo.
        void apiClient.cancelPhotoHandoff(created.code, created.key);
        return;
      }
      handoffRef.current = { code: created.code, key: created.key };
      setQr({ src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(created.qrSvg)}`, url: created.url });
      setStato("attesa");
    } catch (error) {
      if (generation !== generationRef.current) return;
      setErrore(error instanceof Error ? error.message : "Ora non riusciamo a preparare il codice. Scegli la foto dal computer.");
      setStato("errore");
    }
  }, [chiudiCodice, max]);

  useEffect(() => {
    // Il codice si chiede all'apertura: lo stato cambia solo dopo la risposta dell'API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void nuovoCodice();
    return chiudiCodice;
  }, [nuovoCodice, chiudiCodice]);

  useEffect(() => {
    if (stato !== "attesa" && stato !== "collegato") return;
    let alive = true;
    let busy = false;
    const timer = window.setInterval(async () => {
      const handoff = handoffRef.current;
      if (!handoff || busy) return;
      busy = true;
      try {
        const result = await apiClient.takePhotoHandoff(handoff.code, handoff.key);
        if (!alive) return;
        if (result.status === "sent") {
          const type = result.photo.type || "image/jpeg";
          onPhotoRef.current(new File([result.photo], `foto-dal-telefono-${Date.now()}.jpg`, { type }));
          setStato("collegato");
          arrivateRef.current += 1;
          setArrivate(arrivateRef.current);
          // Con una sola foto (o con l'ultima) la finestra si chiude da sola.
          if (arrivateRef.current >= max) onDoneRef.current();
        } else if (result.status === "done") onDoneRef.current();
        else if (result.status === "opened") setStato("collegato");
        else if (result.status === "expired") setStato("scaduto");
      } catch {
        // Un giro andato male (rete): si riprova al prossimo.
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [stato, max]);

  useEffect(() => {
    if (stato === "scaduto" || stato === "errore") primaryRef.current?.focus();
  }, [stato]);

  return (
    <div className="webcam">
      <div className="webcam-head">
        <h2 className="webcam-title">Scatta dal telefono</h2>
        <button type="button" className="webcam-close" onClick={onClose} aria-label="Chiudi">
          ✕
        </button>
      </div>

      {stato === "scaduto" || stato === "errore" ? (
        <div className="webcam-error" role="alert">
          <Smartphone size={28} strokeWidth={2} aria-hidden="true" />
          <strong>{stato === "scaduto" ? "Il codice è scaduto" : "Il codice non è pronto"}</strong>
          <p>{stato === "scaduto" ? "Vale 10 minuti. Prepariamone uno nuovo." : errore}</p>
        </div>
      ) : (
        <div className="handoff-body">
          <div className="handoff-qr">
            {qr ? (
              // eslint-disable-next-line @next/next/no-img-element -- codice QR fatto dall'API (data:), non un'immagine da ottimizzare
              <img src={qr.src} data-link={qr.url} alt="Codice QR da inquadrare con il telefono" width={200} height={200} />
            ) : (
              <span className="handoff-qr-wait" role="status">
                Preparo il codice…
              </span>
            )}
          </div>
          <ol className="handoff-steps">
            <li>Apri la fotocamera del telefono e inquadra il codice.</li>
            <li>Tocca il link che compare e scatta la foto{max > 1 ? "" : " del problema"}.</li>
            <li>
              {max > 1
                ? `Tocca "Manda al computer" per ogni foto, fino a ${max}: arrivano qui da sole.`
                : 'Tocca "Manda al computer": la foto arriva qui da sola.'}
            </li>
          </ol>
        </div>
      )}

      {arrivate > 0 && (stato === "attesa" || stato === "collegato") ? (
        <p className="handoff-status handoff-status-ok" role="status" aria-live="polite">
          <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" />
          {arrivate === 1 ? "1 foto arrivata" : `${arrivate} foto arrivate`}
          {max - arrivate > 0 ? ` · puoi mandarne ancora ${max - arrivate}` : ""}
        </p>
      ) : stato === "attesa" || stato === "collegato" ? (
        <p className="handoff-status" role="status" aria-live="polite">
          <span className="handoff-dot" aria-hidden="true" />
          {stato === "collegato" ? "Telefono collegato: aspetto la foto…" : "Aspetto il telefono… Il codice vale 10 minuti."}
        </p>
      ) : null}

      <div className="webcam-actions">
        {stato === "scaduto" || stato === "errore" ? (
          stato === "scaduto" ? (
            <button
              ref={primaryRef}
              type="button"
              className="webcam-primary"
              onClick={() => {
                setStato("creo");
                setQr(null);
                void nuovoCodice();
              }}
            >
              Nuovo codice
            </button>
          ) : (
            <button ref={primaryRef} type="button" className="webcam-primary" onClick={onChooseFile}>
              Scegli dal computer
            </button>
          )
        ) : arrivate > 0 ? (
          <button type="button" className="webcam-primary" onClick={() => onDoneRef.current()}>
            Fatto
          </button>
        ) : (
          <button type="button" className="webcam-secondary" onClick={onClose}>
            Annulla
          </button>
        )}
      </div>
    </div>
  );
}
