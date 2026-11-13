"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { Button, brand } from "@professionisti/ui";
import { coverPresetsFor, profileCover } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { localPreviewUrl } from "@/lib/media";
import { ImageCropModal } from "@/components/ImageCropModal";
import { UploadingDots } from "@/components/UploadingDots";
import styles from "./CoverPicker.module.css";

export type CoverValue = { coverImageUrl: string | null; coverPreset: string | null };

/**
 * Copertina del profilo pubblico (docs/changelog/2026-11-13-copertina-profilo.md):
 * una foto propria ritagliata 2:1, oppure una delle copertine pronte per
 * mestiere, oppure nessuna (resta lo sfondo del sito). Si salva subito, come
 * la foto profilo: la foto caricata passa prima dal controllo dei contatti.
 */
export function CoverPicker({
  token,
  canEdit,
  categorySlugs,
  value,
  onChange,
}: {
  token: string;
  /** Falso al primissimo profilo: la copertina si aggiunge dopo il primo salvataggio. */
  canEdit: boolean;
  categorySlugs: readonly string[];
  value: CoverValue;
  onChange: (value: CoverValue) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [busy, setBusy] = useState<"upload" | "preset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const src = profileCover(value)?.src ?? null;
  const presets = coverPresetsFor(categorySlugs);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setCropSrc(localPreviewUrl(file));
  }

  function closeCrop() {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  }

  async function handleCropConfirm(blob: Blob) {
    closeCrop();
    setBusy("upload");
    setError(null);
    try {
      onChange(await apiClient.uploadMyCover(token, blob));
      setShowPresets(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Caricamento non riuscito, riprova.");
    } finally {
      setBusy(null);
    }
  }

  async function choosePreset(preset: string | null) {
    setBusy("preset");
    setError(null);
    try {
      onChange(await apiClient.setMyCoverPreset(token, preset));
      if (preset) setShowPresets(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Non è stato possibile salvare, riprova.");
    } finally {
      setBusy(null);
    }
  }

  if (!canEdit) {
    return <p className={styles.note}>Salva il profilo, poi potrai aggiungere un&apos;immagine di copertina.</p>;
  }

  return (
    <div className={styles.picker}>
      <div className={styles.preview}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto di Cloudinary già ridotta o copertina in /public
          <img src={src} alt="" />
        ) : (
          <span className={styles.empty}>Nessuna copertina: resta lo sfondo del sito</span>
        )}
        {busy === "upload" ? (
          <span className={styles.busy}>
            Controllo l&apos;immagine
            <UploadingDots dotSize={4} color={brand.grafite} />
          </span>
        ) : null}
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" size="3" height={40} disabled={busy !== null} opacity={busy ? 0.6 : 1} onPress={() => inputRef.current?.click()}>
          {value.coverImageUrl ? "Cambia foto" : "Carica una foto"}
        </Button>
        <Button
          variant="secondary"
          size="3"
          height={40}
          disabled={busy !== null}
          opacity={busy ? 0.6 : 1}
          aria-expanded={showPresets}
          aria-controls="copertine-pronte"
          onPress={() => setShowPresets((open) => !open)}
        >
          Scegli tra quelle pronte
        </Button>
        {src ? (
          <button type="button" className={styles.remove} disabled={busy !== null} onClick={() => choosePreset(null)}>
            Togli la copertina
          </button>
        ) : null}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} hidden />

      <p className={styles.note}>Niente telefono, email o siti nell&apos;immagine: i contatti si scambiano dopo che il cliente accetta il preventivo.</p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}

      {showPresets ? (
        <div id="copertine-pronte" className={styles.grid} role="group" aria-label="Copertine pronte">
          {presets.map((preset) => {
            const active = value.coverPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                className={`${styles.option}${active ? ` ${styles.optionActive}` : ""}`}
                aria-pressed={active}
                disabled={busy !== null}
                onClick={() => choosePreset(preset.id)}
              >
                <span className={styles.thumb}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- copia piccola già pronta in /public */}
                  <img src={preset.thumb} alt="" loading="lazy" decoding="async" />
                </span>
                <span className={styles.optionLabel}>{preset.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {cropSrc ? <ImageCropModal imageSrc={cropSrc} shape="cover" onCancel={closeCrop} onConfirm={handleCropConfirm} /> : null}
    </div>
  );
}
