"use client";

import { MEDIA_UPLOAD_MAX_BYTES, MEDIA_VIDEO_MAX_SECONDS } from "@professionisti/shared";
import { ApiError, NETWORK_ERROR_CODE, NETWORK_ERROR_MESSAGE } from "@professionisti/api-client";
import { apiClient } from "@/lib/apiClient";
import { localPreviewUrl } from "@/lib/media";

/**
 * Caricamento di foto e video con la percentuale, comune a richiesta di
 * preventivo, "Le mie richieste" e chat
 * (docs/changelog/2026-11-18-video-che-carica-ancora.md):
 * - peso e durata si controllano prima di caricare (`checkMediaFile`);
 * - un video va direttamente dal browser a Cloudinary con un permesso firmato
 *   dalla nostra API (decisione di Luca del 18/11: con tanto traffico non deve
 *   passare dal nostro server), e Cloudinary lo salva in 480p;
 * - le foto (già piccole) e i documenti passano dall'API come prima; anche un
 *   video, se Cloudinary non dà il permesso (non configurato) o rifiuta la firma.
 */

const SIZE_MB = 1024 * 1024;

/** Un file che non va caricato (troppo pesante o troppo lungo): riprovare non serve. */
export class MediaRejectedError extends Error {}

/**
 * Video più lungo del massimo ma non troppo pesante: si può tenere lo stesso,
 * Cloudinary conserva solo il primo minuto (`du_` all'arrivo). Dove il modulo
 * lo sa fare offre la scelta "Tieni il primo minuto" o "Rifai il video"
 * (docs/changelog/2026-11-19-video-lungo-due-scelte.md).
 */
export class MediaTooLongError extends MediaRejectedError {
  constructor(
    message: string,
    readonly seconds: number,
  ) {
    super(message);
  }
}

/** Durata del video in secondi, o null se il browser non la sa leggere entro 4 secondi. */
function videoDuration(file: Blob): Promise<number | null> {
  return new Promise((resolve) => {
    // localPreviewUrl: stesso indirizzo blob: delle anteprime, già passato da encodeURI (CodeQL).
    const url = localPreviewUrl(file);
    const video = document.createElement("video");
    const finish = (value: number | null) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 4000);
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/** "45 secondi", "1 minuto e 23 secondi", "2 minuti". */
export function durationText(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  const secondsText = rest === 1 ? "1 secondo" : `${rest} secondi`;
  if (minutes === 0) return secondsText;
  const minutesText = minutes === 1 ? "1 minuto" : `${minutes} minuti`;
  return rest === 0 ? minutesText : `${minutesText} e ${secondsText}`;
}

const isVideoFile = (file: Blob) => file.type.startsWith("video/");

/** Il motivo per cui il peso non va, o null. Subito, senza aspettare nulla. */
export function mediaSizeProblem(file: Blob): string | null {
  if (file.size <= MEDIA_UPLOAD_MAX_BYTES) return null;
  const mb = Math.ceil(file.size / SIZE_MB);
  const max = Math.round(MEDIA_UPLOAD_MAX_BYTES / SIZE_MB);
  return isVideoFile(file)
    ? `Il video pesa ${mb} MB, il massimo è ${max} MB. Fanne uno più corto: mezzo minuto basta.`
    : `Il file pesa ${mb} MB, il massimo è ${max} MB.`;
}

/**
 * Controlla peso e, per un video, durata (1 minuto, con 5 secondi di
 * tolleranza: "un minuto" registrato a mano dura spesso 61-62 secondi). Se il
 * browser non sa leggere la durata il video passa: decide il peso, e
 * Cloudinary taglia comunque oltre il massimo.
 */
export async function checkMediaFile(file: Blob): Promise<void> {
  const tooBig = mediaSizeProblem(file);
  if (tooBig) throw new MediaRejectedError(tooBig);
  if (!isVideoFile(file)) return;
  const seconds = await videoDuration(file);
  if (seconds !== null && seconds > MEDIA_VIDEO_MAX_SECONDS + 5) {
    throw new MediaTooLongError(`Il video dura ${durationText(seconds)}, il massimo è 1 minuto. Fanne uno più corto.`, seconds);
  }
}

/** Invio di un modulo con la percentuale (fetch non la sa dire). Stato 0 = rete. */
function postWithProgress(url: string, form: FormData, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress?.(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => {
      let body: unknown;
      try {
        body = xhr.responseText ? (JSON.parse(xhr.responseText) as unknown) : null;
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body);
      else reject(new ApiError(`Caricamento non riuscito (${xhr.status}).`, xhr.status));
    };
    // Stessa frase del resto del sito (docs/changelog/2026-11-19-errore-di-rete-in-italiano.md).
    xhr.onerror = () => reject(new ApiError(NETWORK_ERROR_MESSAGE, 0, NETWORK_ERROR_CODE));
    xhr.onabort = () => reject(new ApiError("Caricamento annullato.", 0, "ABORTED"));
    if (signal) {
      if (signal.aborted) return reject(new ApiError("Caricamento annullato.", 0, "ABORTED"));
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(form);
  });
}

/** Il video direttamente a Cloudinary; null se il permesso non c'è (si ripiega sull'API). */
async function uploadVideoDirect(
  token: string,
  file: Blob,
  forChat: boolean,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  let ticket: { uploadUrl: string; fields: Record<string, string> };
  try {
    ticket = await apiClient.getVideoUploadTicket(token, forChat);
  } catch (err) {
    // 503: Cloudinary non configurato per il caricamento diretto. Altri errori del permesso: idem, si prova dall'API.
    // 429: video di oggi finiti (docs/changelog/2026-11-19-revisione-termini-e-video.md): niente ripiego, si mostra il messaggio.
    if (err instanceof ApiError && err.status !== 0 && err.status !== 429) return null;
    throw err;
  }
  // Solo verso Cloudinary: un indirizzo diverso non deve mai ricevere il file.
  if (!ticket.uploadUrl.startsWith("https://api.cloudinary.com/")) return null;
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
  form.append("file", file);
  try {
    const body = (await postWithProgress(ticket.uploadUrl, form, onProgress, signal)) as { secure_url?: unknown } | null;
    if (typeof body?.secure_url === "string" && body.secure_url.startsWith("https://res.cloudinary.com/")) return body.secure_url;
    return null;
  } catch (err) {
    // 400/401 da Cloudinary (firma scaduta, formato non accettato): si riprova dall'API, che dice il motivo.
    if (err instanceof ApiError && err.status >= 400 && err.status < 500) return null;
    throw err;
  }
}

/**
 * Carica un file e restituisce il suo indirizzo. `forChat`: allegato della
 * chat (anche documenti), altrimenti foto o video di una richiesta.
 */
export async function uploadMediaFile(
  token: string,
  file: Blob,
  options: { forChat?: boolean; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
): Promise<string> {
  const { forChat = false, onProgress, signal } = options;
  if (isVideoFile(file)) {
    const direct = await uploadVideoDirect(token, file, forChat, onProgress, signal);
    if (direct) return direct;
    onProgress?.(0);
  }
  const result = forChat
    ? await apiClient.uploadTimelinePhotoWithProgress(token, file, onProgress, signal)
    : await apiClient.uploadGuidedRequestPhotoWithProgress(token, file, onProgress, signal);
  return result.imageUrl;
}

/** Messaggio da mostrare per un caricamento non riuscito. */
export function uploadErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 0 && err.code !== "ABORTED") return NETWORK_ERROR_MESSAGE;
  return err instanceof Error ? err.message : "Caricamento non riuscito.";
}
