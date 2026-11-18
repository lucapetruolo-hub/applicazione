"use client";

import { Camera, CheckCircle2, Image as ImageIcon, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { apiClient } from "@/lib/apiClient";
import { localPreviewUrl } from "@/lib/media";
import { shrinkPhoto } from "@/lib/photoSearch";

type Stato = "apro" | "pronto" | "anteprima" | "invio" | "fatto" | "scaduto";

/** Quante foto ha mandato e quante ne può mandare (docs/changelog/2026-11-17-piu-foto-dal-telefono.md). */
type Conto = { sent: number; max: number };

/** Una foto pronta da mandare, già rimpicciolita. */
type Pronta = { id: number; blob: Blob; url: string };

/** Ogni quanto il telefono rilegge il conto: se sul computer si toglie una foto, torna un posto. */
const REFRESH_MS = 5000;

/**
 * Il telefono scatta (o sceglie dalla galleria), vede la foto e la manda al
 * computer. La foto si rimpicciolisce qui e perde la posizione GPS prima di
 * partire, come nella ricerca con foto. Se il computer ne aspetta più di una,
 * dal 18/11 (docs/changelog/2026-11-17-piu-foto-dal-telefono.md e
 * 2026-11-18-foto-dal-telefono-anteprime.md) se ne scelgono più insieme dalla
 * galleria o se ne scattano più di fila: si vedono in piccolo con una X e
 * partono tutte con un tocco.
 */
export function ScattaDalTelefono({ code }: { code: string }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [stato, setStato] = useState<Stato>("apro");
  const [pronte, setPronte] = useState<Pronta[]>([]);
  const nextIdRef = useRef(1);
  /** Durante l'invio: quale foto sta partendo, su quante. */
  const [invio, setInvio] = useState<{ n: number; di: number } | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [conto, setConto] = useState<Conto>({ sent: 0, max: 1 });

  useEffect(() => {
    let alive = true;
    apiClient
      .openPhotoHandoff(code)
      .then((result) => {
        if (!alive) return;
        if (result.max > 0) setConto({ sent: result.sent, max: result.max });
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

  // Le anteprime si liberano quando la pagina si chiude.
  const pronteRef = useRef<Pronta[]>([]);
  useEffect(() => {
    pronteRef.current = pronte;
  }, [pronte]);
  useEffect(() => {
    return () => {
      for (const pronta of pronteRef.current) URL.revokeObjectURL(pronta.url);
    };
  }, []);

  // Se sul computer si toglie una foto con la X, il posto torna libero: il
  // telefono rilegge il conto ogni tanto, anche dopo "Fatto".
  useEffect(() => {
    if (conto.max <= 1 || (stato !== "pronto" && stato !== "fatto")) return;
    const timer = window.setInterval(() => {
      apiClient
        .openPhotoHandoff(code)
        .then((result) => {
          if (result.status === "expired") setStato("scaduto");
          else if (result.max > 0) {
            setConto({ sent: result.sent, max: result.max });
            setStato((attuale) => (attuale === "fatto" && result.sent < result.max ? "pronto" : attuale));
          }
        })
        .catch(() => undefined);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [code, conto.max, stato]);

  const liberi = Math.max(0, conto.max - conto.sent - pronte.length);

  async function scelta(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setErrore(null);
    const posti = Math.max(1, conto.max - conto.sent - pronte.length);
    const prese = files.slice(0, posti);
    const nuove: Pronta[] = [];
    let rotte = 0;
    for (const file of prese) {
      try {
        const blob = await shrinkPhoto(file);
        nuove.push({ id: nextIdRef.current++, blob, url: localPreviewUrl(new File([blob], "foto.jpg", { type: "image/jpeg" })) });
      } catch {
        rotte += 1;
      }
    }
    if (nuove.length > 0) {
      setPronte((attuali) => [...attuali, ...nuove]);
      setStato("anteprima");
    }
    if (rotte > 0) setErrore(rotte === 1 ? "Non riusciamo ad aprire una foto. Prova a sceglierne un'altra." : `Non riusciamo ad aprire ${rotte} foto. Prova a sceglierne altre.`);
    else if (files.length > prese.length) setErrore(`Ne abbiamo prese ${prese.length}: è il massimo che il computer aspetta.`);
  }

  function togli(id: number) {
    setPronte((attuali) => {
      const via = attuali.find((pronta) => pronta.id === id);
      if (via) URL.revokeObjectURL(via.url);
      const rimaste = attuali.filter((pronta) => pronta.id !== id);
      if (rimaste.length === 0) setStato("pronto");
      return rimaste;
    });
    setErrore(null);
  }

  async function manda() {
    if (pronte.length === 0) return;
    setStato("invio");
    setErrore(null);
    const daMandare = pronte;
    let mandate = 0;
    let ultimo = conto;
    try {
      for (const pronta of daMandare) {
        setInvio({ n: mandate + 1, di: daMandare.length });
        const sent = await apiClient.sendPhotoHandoff(code, pronta.blob);
        setConto(sent);
        ultimo = sent;
        mandate += 1;
        URL.revokeObjectURL(pronta.url);
        setPronte((attuali) => attuali.filter((item) => item.id !== pronta.id));
      }
      setInvio(null);
      // Se il computer ne aspetta altre si torna ai pulsanti, con il conto.
      setStato(ultimo.sent >= ultimo.max ? "fatto" : "pronto");
    } catch (error) {
      setInvio(null);
      const status = (error as { status?: number }).status;
      if (status === 410) setStato("scaduto");
      else if (status === 409) setStato("fatto");
      else {
        setStato("anteprima");
        const resto = daMandare.length - mandate;
        setErrore(
          mandate > 0
            ? `${mandate === 1 ? "1 foto è arrivata" : `${mandate} foto sono arrivate`}, ${resto === 1 ? "1 no" : `${resto} no`}. Tocca di nuovo "Manda al computer".`
            : error instanceof Error
              ? error.message
              : "Non riusciamo a mandare la foto. Riprova.",
        );
      }
    }
  }

  function rifai() {
    for (const pronta of pronte) URL.revokeObjectURL(pronta.url);
    setPronte([]);
    setStato("pronto");
  }

  return (
    <div className="scatta-page">
      <div className="scatta-card">
        {stato === "fatto" ? (
          <div className="scatta-done" role="status">
            <CheckCircle2 size={48} strokeWidth={2} aria-hidden="true" />
            <h1 className="scatta-title">{conto.sent > 1 ? "Fatto, le foto sono sul computer" : "Fatto, la foto è sul computer"}</h1>
            <p className="scatta-text">Torna al computer per continuare. Puoi chiudere questa pagina.</p>
          </div>
        ) : stato === "scaduto" ? (
          <div className="scatta-done scatta-expired" role="alert">
            <h1 className="scatta-title">Questo codice è scaduto</h1>
            <p className="scatta-text">
              Il codice vale 10 minuti, oppure si è chiusa la finestra sul computer. Dal computer apri di nuovo &quot;Scatta dal telefono&quot; e
              inquadra il codice nuovo.
            </p>
          </div>
        ) : (
          <>
            <h1 className="scatta-title">
              {stato === "anteprima" || stato === "invio" ? (pronte.length > 1 ? `Vanno bene queste ${pronte.length} foto?` : "Va bene questa foto?") : conto.sent > 0 ? "Foto mandata" : conto.max > 1 ? "Scatta le foto" : "Scatta la foto del problema"}
            </h1>
            {conto.sent > 0 && stato !== "anteprima" && stato !== "invio" ? (
              <p className="scatta-sent" role="status">
                <CheckCircle2 size={20} strokeWidth={2} aria-hidden="true" />
                {conto.sent === 1 ? "1 foto è arrivata sul computer" : `${conto.sent} foto sono arrivate sul computer`}. Puoi mandarne ancora{" "}
                {conto.max - conto.sent}, oppure torna al computer e tocca &quot;Aggiungi&quot;.
              </p>
            ) : null}
            {pronte.length > 0 && (stato === "anteprima" || stato === "invio") ? (
              <>
                {pronte.length === 1 && liberi === 0 ? (
                  // Una foto sola da mandare: grande, con "Rifai", come prima.
                  // eslint-disable-next-line @next/next/no-img-element -- foto locale (blob:), non un'immagine da ottimizzare
                  <img className="scatta-preview" src={pronte[0]!.url} alt="La foto da mandare al computer" />
                ) : (
                  <ul className="scatta-grid" aria-label="Foto da mandare al computer">
                    {pronte.map((pronta, index) => (
                      <li key={pronta.id} className="scatta-grid-item">
                        {/* eslint-disable-next-line @next/next/no-img-element -- foto locale (blob:), non un'immagine da ottimizzare */}
                        <img src={pronta.url} alt={`Foto ${index + 1} da mandare`} />
                        <button
                          type="button"
                          className="handoff-thumb-remove"
                          onClick={() => togli(pronta.id)}
                          disabled={stato === "invio"}
                          aria-label={`Togli la foto ${index + 1}`}
                        >
                          <X size={16} strokeWidth={2.5} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="scatta-actions">
                  <button type="button" className="webcam-primary scatta-wide" onClick={() => void manda()} disabled={stato === "invio"}>
                    {invio
                      ? invio.di > 1
                        ? `Mando la foto ${invio.n} di ${invio.di}…`
                        : "Mando la foto…"
                      : pronte.length > 1
                        ? `Manda ${pronte.length} foto al computer`
                        : "Manda al computer"}
                  </button>
                  {liberi > 0 ? (
                    <div className="scatta-more">
                      <button type="button" className="webcam-secondary" onClick={() => cameraRef.current?.click()} disabled={stato === "invio"}>
                        <Camera size={18} strokeWidth={2} aria-hidden="true" />
                        Scatta
                      </button>
                      <button type="button" className="webcam-secondary" onClick={() => galleryRef.current?.click()} disabled={stato === "invio"}>
                        <ImageIcon size={18} strokeWidth={2} aria-hidden="true" />
                        Galleria
                      </button>
                    </div>
                  ) : pronte.length === 1 ? (
                    <button type="button" className="webcam-secondary scatta-wide" onClick={rifai} disabled={stato === "invio"}>
                      <RotateCcw size={18} strokeWidth={2} aria-hidden="true" />
                      Rifai
                    </button>
                  ) : null}
                </div>
                {liberi > 0 ? <p className="scatta-hint">Puoi aggiungerne ancora {liberi}.</p> : null}
              </>
            ) : (
              <>
                {conto.sent === 0 ? (
                  <p className="scatta-text">
                    {conto.max > 1
                      ? `Puoi mandare fino a ${conto.max} foto: scattale una dopo l'altra o scegline più insieme dalla galleria. Arrivano da sole sul computer. Niente persone o documenti.`
                      : "Inquadra il problema da vicino, con buona luce. Niente persone o documenti. La foto arriva da sola sul computer."}
                  </p>
                ) : null}
                <div className="scatta-actions">
                  <button type="button" className="webcam-primary scatta-wide" onClick={() => cameraRef.current?.click()} disabled={stato === "apro"}>
                    <Camera size={20} strokeWidth={2} aria-hidden="true" />
                    {conto.sent > 0 ? "Scatta un'altra foto" : "Scatta una foto"}
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
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        multiple={conto.max - conto.sent - pronte.length > 1}
        hidden
        onChange={(event) => void scelta(event)}
      />
    </div>
  );
}
