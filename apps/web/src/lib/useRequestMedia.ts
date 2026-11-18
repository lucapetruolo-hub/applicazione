"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError } from "@professionisti/api-client";
import { localPreviewUrl } from "@/lib/media";
import { moveItem } from "@/lib/usePhotoReorder";
import { MediaRejectedError, checkMediaFile, mediaSizeProblem, uploadErrorMessage, uploadMediaFile } from "@/lib/mediaUpload";
import { frameFromVideo, withoutHiddenData } from "@/lib/photoSearch";

/**
 * Foto e video della richiesta di preventivo, ognuno col suo stato
 * (docs/changelog/2026-11-18-video-che-carica-ancora.md).
 *
 * Prima un video che si caricava ancora poteva restare fuori dalla richiesta:
 * il caricamento si accendeva solo dopo aver preso un fotogramma (fino a 8
 * secondi su iPhone, con "Invia" libero), e un errore compariva al passo 1
 * mentre il cliente era già al passo 3. Ora:
 * - il riquadro compare subito, con la percentuale del caricamento;
 * - "Invia" non scarta mai nulla: aspetta che tutto sia caricato (`waitAll`) e,
 *   se un file non si carica, la richiesta non parte e si dice quale;
 * - un errore di rete si riprova una volta da solo;
 * - da non registrati il file resta nel browser e si carica all'invio, dopo
 *   l'accesso (Verbale Cognitivo F2.2, come prima).
 */
export type RequestMediaStatus = "local" | "uploading" | "done" | "error";

export type RequestMediaItem = {
  /** Anteprima nel browser (blob:), resta la stessa per tutta la vita del riquadro. */
  id: string;
  isVideo: boolean;
  status: RequestMediaStatus;
  /** Da 0 a 1, solo mentre si carica. */
  progress: number;
  /** Indirizzo su Cloudinary, quando è caricato. */
  remoteUrl: string | null;
  error: string | null;
  /** Falso per un file troppo pesante: riprovare non serve, va tolto. */
  retryable: boolean;
};

type Prepared = { file: Blob };

export function useRequestMedia(token: string | null, maxItems: number) {
  const [items, setItems] = useState<RequestMediaItem[]>([]);
  // Copia sempre aggiornata, per le funzioni che girano dopo un `await`.
  const itemsRef = useRef<RequestMediaItem[]>([]);
  const preparedRef = useRef(new Map<string, Promise<Prepared>>());
  const uploadsRef = useRef(new Map<string, Promise<string>>());
  const abortRef = useRef(new Map<string, AbortController>());
  const tokenRef = useRef(token);
  // Le copie piccole per l'IA (una foto o un fotogramma del video), pronte anche dopo.
  const aiCopiesRef = useRef(new Map<string, Blob>());
  const [aiCopiesVersion, setAiCopiesVersion] = useState(0);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  function update(next: (prev: RequestMediaItem[]) => RequestMediaItem[]) {
    itemsRef.current = next(itemsRef.current);
    setItems(itemsRef.current);
  }

  function patch(id: string, values: Partial<RequestMediaItem>) {
    update((prev) => prev.map((item) => (item.id === id ? { ...item, ...values } : item)));
  }

  const exists = (id: string) => itemsRef.current.some((item) => item.id === id);

  function upload(id: string, activeToken: string): Promise<string> {
    const running = uploadsRef.current.get(id);
    if (running) return running;
    const controller = new AbortController();
    abortRef.current.set(id, controller);
    patch(id, { status: "uploading", progress: 0, error: null });
    let shownPercent = 0;
    const onProgress = (fraction: number) => {
      // Al massimo cento aggiornamenti, non uno per pacchetto.
      const percent = Math.floor(fraction * 100);
      if (percent === shownPercent) return;
      shownPercent = percent;
      patch(id, { progress: fraction });
    };
    const job = (async () => {
      const prepared = await preparedRef.current.get(id);
      if (!prepared) throw new Error("File non trovato, aggiungilo di nuovo.");
      for (let attempt = 0; ; attempt++) {
        try {
          return await uploadMediaFile(activeToken, prepared.file, { onProgress, signal: controller.signal });
        } catch (err) {
          const networkError = err instanceof ApiError && err.status === 0 && err.code !== "ABORTED";
          // La rete del telefono che cade un attimo: si riprova una volta, da capo.
          if (networkError && attempt === 0 && !controller.signal.aborted) {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            continue;
          }
          throw err;
        }
      }
    })();
    const tracked = job.then(
      (url) => {
        uploadsRef.current.delete(id);
        abortRef.current.delete(id);
        if (exists(id)) patch(id, { status: "done", progress: 1, remoteUrl: url });
        return url;
      },
      (err: unknown) => {
        uploadsRef.current.delete(id);
        abortRef.current.delete(id);
        // Troppo lungo: l'ha già segnato chi ha controllato la durata.
        if (err instanceof MediaRejectedError) throw err;
        if (exists(id)) patch(id, { status: "error", progress: 0, error: uploadErrorMessage(err) });
        throw err;
      },
    );
    // Il rifiuto lo gestisce chi aspetta (waitAll); qui solo per non lasciarlo "non gestito".
    tracked.catch(() => undefined);
    uploadsRef.current.set(id, tracked);
    return tracked;
  }

  /** Aggiunge una foto o un video: il riquadro compare subito e, da registrati, parte il caricamento. */
  function add(picked: File, options: { cleaned?: boolean; onlyIfEmpty?: boolean } = {}): boolean {
    if (itemsRef.current.length >= maxItems) return false;
    if (options.onlyIfEmpty && itemsRef.current.length > 0) return false;
    const isVideo = picked.type.startsWith("video/");
    const id = localPreviewUrl(picked);
    const tooBig = mediaSizeProblem(picked);
    update((prev) => [
      ...prev,
      { id, isVideo, status: tooBig ? "error" : "local", progress: 0, remoteUrl: null, error: tooBig, retryable: !tooBig },
    ]);
    if (tooBig) return true;
    // Una foto del telefono porta spesso dentro la posizione GPS, cioè
    // l'indirizzo di casa, che il professionista non vede prima
    // dell'accettazione (CLAUDE.md §5 punto 9): la ridisegniamo nel browser,
    // che così perde i dati nascosti e pesa meno
    // (docs/changelog/2026-11-14-foto-per-il-professionista.md). Se il
    // browser non sa aprirla (es. HEIC su Chrome per computer) parte com'è.
    // Un video troppo lungo si ferma qui, prima di caricarlo (checkMediaFile).
    const prepared: Promise<Prepared> = isVideo
      ? checkMediaFile(picked).then(() => ({ file: picked }))
      : (options.cleaned ? Promise.resolve(picked as Blob) : withoutHiddenData(picked)).then((file) => ({ file }));
    preparedRef.current.set(id, prepared);
    prepared.catch((err: unknown) => {
      if (!(err instanceof MediaRejectedError) || !exists(id)) return;
      preparedRef.current.delete(id);
      patch(id, { status: "error", progress: 0, error: err.message, retryable: false });
    });
    const activeToken = tokenRef.current;
    if (activeToken) void upload(id, activeToken).catch(() => undefined);
    // La copia per l'IA (usata solo se dal testo non si capisce il mestiere)
    // si prepara a parte: non ritarda mai il caricamento.
    void (async () => {
      const copy = isVideo ? await frameFromVideo(picked) : (await prepared).file;
      if (!copy || !exists(id)) return;
      aiCopiesRef.current.set(id, copy);
      setAiCopiesVersion((n) => n + 1);
    })();
    return true;
  }

  function remove(id: string) {
    abortRef.current.get(id)?.abort();
    abortRef.current.delete(id);
    uploadsRef.current.delete(id);
    preparedRef.current.delete(id);
    aiCopiesRef.current.delete(id);
    URL.revokeObjectURL(id);
    update((prev) => prev.filter((item) => item.id !== id));
  }

  /** Sposta un riquadro (trascinamento, docs/changelog/2026-11-18-luci-ia-solo-con-ia.md). */
  function move(from: number, to: number) {
    update((prev) => moveItem(prev, from, to));
  }

  /** Riprova un file non caricato (da registrati). */
  function retry(id: string) {
    const activeToken = tokenRef.current;
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!activeToken || !item || item.status !== "error" || !preparedRef.current.has(id)) return;
    void upload(id, activeToken).catch(() => undefined);
  }

  /**
   * All'invio: carica quello che manca, aspetta quello che si sta caricando e
   * restituisce gli indirizzi nell'ordine dei riquadri. Se anche un solo file
   * non si carica restituisce `null`: la richiesta non parte senza.
   */
  async function waitAll(activeToken: string): Promise<string[] | null> {
    const current = itemsRef.current;
    const jobs = current.map((item) => {
      if (item.status === "done" && item.remoteUrl) return Promise.resolve(item.remoteUrl);
      // Troppo pesante o troppo lungo: resta un errore, non si riprova.
      if (!preparedRef.current.has(item.id)) return Promise.reject(new Error(item.error ?? "File non caricato."));
      return upload(item.id, activeToken);
    });
    const results = await Promise.allSettled(jobs);
    if (results.some((result) => result.status === "rejected")) return null;
    // L'ordine è quello dei riquadri adesso (si possono spostare mentre si
    // aspetta); un riquadro tolto nel frattempo non va nella richiesta.
    const urlById = new Map(current.map((item, index) => [item.id, (results[index] as PromiseFulfilledResult<string>).value]));
    return itemsRef.current.flatMap((item) => {
      const url = urlById.get(item.id);
      return url ? [url] : [];
    });
  }

  // Le anteprime nel browser si liberano quando si lascia il modulo.
  useEffect(
    () => () => {
      for (const controller of abortRef.current.values()) controller.abort();
      for (const item of itemsRef.current) URL.revokeObjectURL(item.id);
    },
    [],
  );

  const uploading = items.filter((item) => item.status === "uploading");
  const failed = items.filter((item) => item.status === "error");
  // Avanzamento complessivo: la media dei file che si stanno caricando.
  const progress =
    uploading.length === 0 ? 1 : uploading.reduce((sum, item) => sum + item.progress, 0) / uploading.length;

  return {
    items,
    add,
    remove,
    move,
    retry,
    waitAll,
    uploadingCount: uploading.length,
    uploadingVideo: uploading.some((item) => item.isVideo),
    progress,
    failedCount: failed.length,
    /** La copia per l'IA di un riquadro, se è pronta (da usare negli effetti). */
    aiCopyOf: (id: string) => aiCopiesRef.current.get(id),
    aiCopiesVersion,
  };
}
