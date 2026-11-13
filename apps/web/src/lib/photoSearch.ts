import { PROBLEM_PHOTO_MAX_EDGE } from "@professionisti/shared";

/**
 * Ricerca con foto (docs/changelog/2026-11-13-ricerca-con-foto.md): la foto
 * si rimpicciolisce nel browser (lato lungo 1280 px, JPEG) prima di partire:
 * costa un terzo, si carica prima e perde i dati della posizione (GPS),
 * perché la tela del browser non copia i dati nascosti della foto.
 * Poi resta solo in questa scheda del browser, per allegarla alla richiesta
 * se il cliente la manda; sul server non si salva.
 */

const STORAGE_KEY = "ricerca-foto";
/** La foto si allega alla richiesta solo se è recente: come il risultato sul server, mezz'ora. */
const MAX_AGE_MS = 30 * 60_000;

export async function shrinkPhoto(file: File): Promise<Blob> {
  // "from-image": la foto girata dal telefono resta dritta.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, PROBLEM_PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Questo browser non riesce a preparare la foto.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Questo browser non riesce a preparare la foto."))), "image/jpeg", 0.82);
  });
}

type SavedPhoto = { description: string; dataUrl: string; at: number };

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Foto non leggibile"));
    reader.readAsDataURL(blob);
  });
}

/** Tiene la foto in questa scheda per la richiesta di preventivo, legata alla descrizione della ricerca. */
export async function rememberSearchPhoto(description: string, photo: Blob): Promise<void> {
  try {
    const saved: SavedPhoto = { description, dataUrl: await blobToDataUrl(photo), at: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Spazio pieno o navigazione privata: la richiesta parte senza foto, il cliente può aggiungerla.
  }
}

export function forgetSearchPhoto(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // niente da fare
  }
}

/** La foto della ricerca, se la richiesta nasce da quella ricerca (stessa descrizione) e non è vecchia. */
export function searchPhotoFor(description: string): File | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<SavedPhoto>;
    if (!saved.dataUrl?.startsWith("data:image/jpeg;base64,") || typeof saved.at !== "number" || Date.now() - saved.at > MAX_AGE_MS) return null;
    if (!saved.description || !description.trim().startsWith(saved.description.trim())) return null;
    const bytes = Uint8Array.from(atob(saved.dataUrl.slice("data:image/jpeg;base64,".length)), (char) => char.charCodeAt(0));
    return new File([bytes], "foto-del-problema.jpg", { type: "image/jpeg" });
  } catch {
    return null;
  }
}
