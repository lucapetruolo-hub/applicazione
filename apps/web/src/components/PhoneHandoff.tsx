"use client";

import { CheckCircle2, Smartphone, X } from "lucide-react";
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
 * Dal 18/11 (docs/changelog/2026-11-18-foto-dal-telefono-anteprime.md), con
 * più foto, quelle arrivate si vedono qui in piccolo con una X per toglierle
 * (il posto torna libero per il telefono) e passano al modulo tutte insieme con
 * "Aggiungi". Chiudendo la finestra quelle arrivate restano, non si perdono.
 */

type Arrivata = { id: number; file: File; url: string };

const POLL_MS = 2500;

type Stato = "creo" | "attesa" | "collegato" | "scaduto" | "errore";

export function PhoneHandoff({
  maxPhotos = 1,
  onPhoto,
  onPhotos,
  onDone,
  onChooseFile,
  onClose,
}: {
  /** Quante foto può mandare il telefono con questo codice. */
  maxPhotos?: number;
  /** Ogni foto arrivata: subito con una foto sola, con "Aggiungi" (o alla chiusura) con più foto. */
  onPhoto: (file: File) => void;
  /** Se c'è, con più foto le passa tutte insieme in una volta (come la scelta di più file). */
  onPhotos?: (files: File[]) => void;
  /** Tutte le foto arrivate (o "Fatto"): la finestra si chiude. */
  onDone: () => void;
  /** "Scegli dal computer" se il codice non si riesce a preparare. */
  onChooseFile: () => void;
  onClose: () => void;
}) {
  // Fissato all'apertura: mentre arrivano le foto i posti liberi calano, ma il codice resta lo stesso.
  const [max] = useState(() => Math.max(1, Math.min(10, Math.floor(maxPhotos) || 1)));
  const [arrivate, setArrivate] = useState<Arrivata[]>([]);
  /** Le foto arrivate e non ancora passate al modulo, anche per la chiusura della finestra. */
  const arrivateRef = useRef<Arrivata[]>([]);
  const nextIdRef = useRef(1);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  // Sempre l'ultima funzione, senza far ripartire il giro delle domande a ogni disegno.
  const onPhotoRef = useRef(onPhoto);
  const onPhotosRef = useRef(onPhotos);
  useEffect(() => {
    onPhotoRef.current = onPhoto;
    onPhotosRef.current = onPhotos;
  }, [onPhoto, onPhotos]);
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
          const file = new File([result.photo], `foto-dal-telefono-${Date.now()}.jpg`, { type });
          setStato("collegato");
          if (max === 1) {
            // Con una sola foto la finestra si chiude da sola: il telefono l'ha già vista prima di mandarla.
            onPhotoRef.current(file);
            onDoneRef.current();
            return;
          }
          const arrivata = { id: nextIdRef.current++, file, url: URL.createObjectURL(file) };
          arrivateRef.current = [...arrivateRef.current, arrivata];
          setArrivate(arrivateRef.current);
        } else if (result.status === "done") {
          // Con più foto si resta aperti: una X può liberare un posto.
          if (max === 1) onDoneRef.current();
        }
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

  /** Passa al modulo le foto arrivate (una volta sola) e libera le anteprime. */
  const consegna = useCallback(() => {
    const tutte = arrivateRef.current;
    arrivateRef.current = [];
    if (tutte.length === 0) return;
    for (const arrivata of tutte) URL.revokeObjectURL(arrivata.url);
    const files = tutte.map((arrivata) => arrivata.file);
    if (onPhotosRef.current) onPhotosRef.current(files);
    else for (const file of files) onPhotoRef.current(file);
  }, []);

  // Chiudendo la finestra (X, Esc, fuori) le foto arrivate passano comunque al modulo.
  useEffect(() => consegna, [consegna]);

  function aggiungi() {
    consegna();
    onDoneRef.current();
  }

  function togli(id: number) {
    const arrivata = arrivateRef.current.find((item) => item.id === id);
    if (!arrivata) return;
    URL.revokeObjectURL(arrivata.url);
    arrivateRef.current = arrivateRef.current.filter((item) => item.id !== id);
    setArrivate(arrivateRef.current);
    const handoff = handoffRef.current;
    // Il posto torna libero: il telefono può mandarne un'altra con lo stesso codice.
    if (handoff) void apiClient.releasePhotoHandoff(handoff.code, handoff.key).catch(() => undefined);
  }

  const quante = arrivate.length;

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
            <li>Tocca il link che compare e {max > 1 ? "scatta le foto o sceglile dalla galleria" : "scatta la foto del problema"}.</li>
            <li>
              {max > 1
                ? `Scegli o scatta fino a ${max} foto e tocca "Manda al computer": arrivano qui da sole.`
                : 'Tocca "Manda al computer": la foto arriva qui da sola.'}
            </li>
          </ol>
        </div>
      )}

      {quante > 0 && (stato === "attesa" || stato === "collegato") ? (
        <>
          <ul className="handoff-thumbs" aria-label="Foto arrivate dal telefono">
            {arrivate.map((arrivata, index) => (
              <li key={arrivata.id} className="handoff-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element -- foto locale (blob:), non un'immagine da ottimizzare */}
                <img src={arrivata.url} alt={`Foto ${index + 1} arrivata dal telefono`} />
                <button type="button" className="handoff-thumb-remove" onClick={() => togli(arrivata.id)} aria-label={`Togli la foto ${index + 1}`}>
                  <X size={14} strokeWidth={2.5} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <p className="handoff-status handoff-status-ok" role="status" aria-live="polite">
            <CheckCircle2 size={18} strokeWidth={2} aria-hidden="true" />
            {quante === 1 ? "1 foto arrivata" : `${quante} foto arrivate`}
            {max - quante > 0 ? ` · puoi mandarne ancora ${max - quante}` : ""}
          </p>
        </>
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
        ) : quante > 0 ? (
          <button type="button" className="webcam-primary" onClick={aggiungi}>
            {quante === 1 ? "Aggiungi la foto" : `Aggiungi ${quante} foto`}
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
