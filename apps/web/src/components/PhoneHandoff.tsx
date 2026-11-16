"use client";

import { CheckCircle2, Smartphone } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "@/lib/apiClient";

/**
 * "Scatta dal telefono" nella finestra foto del computer (richiesta di Luca del
 * 16/11/2026, docs/changelog/2026-11-16-scatta-dal-telefono.md): un codice QR,
 * il telefono lo inquadra, scatta e la foto arriva qui da sola. Il computer
 * chiede ogni 2,5 secondi se è arrivata; il codice vale 10 minuti e una foto.
 * Chiudendo la finestra il codice si cancella.
 */

const POLL_MS = 2500;

type Stato = "creo" | "attesa" | "collegato" | "arrivata" | "scaduto" | "errore";

export function PhoneHandoff({
  onPhoto,
  onChooseFile,
  onClose,
}: {
  onPhoto: (file: File) => void;
  /** "Scegli dal computer" se il codice non si riesce a preparare. */
  onChooseFile: () => void;
  onClose: () => void;
}) {
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
  const takenRef = useRef(false);
  const primaryRef = useRef<HTMLButtonElement>(null);

  const chiudiCodice = useCallback(() => {
    generationRef.current += 1;
    const handoff = handoffRef.current;
    handoffRef.current = null;
    if (handoff && !takenRef.current) void apiClient.cancelPhotoHandoff(handoff.code, handoff.key);
  }, []);

  const nuovoCodice = useCallback(async () => {
    chiudiCodice();
    takenRef.current = false;
    const generation = generationRef.current;
    try {
      const created = await apiClient.createPhotoHandoff();
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
  }, [chiudiCodice]);

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
          takenRef.current = true;
          setStato("arrivata");
          const type = result.photo.type || "image/jpeg";
          onPhotoRef.current(new File([result.photo], "foto-dal-telefono.jpg", { type }));
        } else if (result.status === "opened") setStato("collegato");
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
  }, [stato]);

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
      ) : stato === "arrivata" ? (
        <div className="handoff-done" role="status">
          <CheckCircle2 size={40} strokeWidth={2} aria-hidden="true" />
          <strong>Foto arrivata</strong>
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
            <li>Tocca il link che compare e scatta la foto del problema.</li>
            <li>Tocca &quot;Manda al computer&quot;: la foto arriva qui da sola.</li>
          </ol>
        </div>
      )}

      {stato === "attesa" || stato === "collegato" ? (
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
        ) : (
          <button type="button" className="webcam-secondary" onClick={onClose}>
            Annulla
          </button>
        )}
      </div>
    </div>
  );
}
