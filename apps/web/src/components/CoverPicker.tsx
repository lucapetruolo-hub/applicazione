"use client";

import { useState } from "react";
import { Button, brand } from "@professionisti/ui";
import { coverPresetsFor, profileCover } from "@professionisti/shared";
import { apiClient } from "@/lib/apiClient";
import { localPreviewUrl } from "@/lib/media";
import { ImageCropModal } from "@/components/ImageCropModal";
import { PhotoPicker } from "@/components/PhotoPicker";
import { UploadingDots } from "@/components/UploadingDots";
import styles from "./CoverPicker.module.css";

export type CoverValue = { coverImageUrl: string | null; coverPreset: string | null };
/** Quello che il cliente vede sopra la copertina: foto, nome, mestiere e città. */
export type CoverOwner = { name: string; imageUrl: string | null; subtitle: string };

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Riquadro "come la vede il cliente": la copertina con sopra il primo riquadro
 * bianco del profilo, da computer (fascia larga) e da telefono (solo il centro).
 * Con "Scorrendo in su" il riquadro scende e si vede quasi tutta la foto, come
 * sulla pagina vera da computer e da telefono.
 */
function CustomerView({ src, owner, phone }: { src: string; owner: CoverOwner; phone: boolean }) {
  return (
    <figure className={styles.view}>
      <div className={`${styles.frame} ${phone ? styles.framePhone : styles.frameWide}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- foto di Cloudinary già ridotta o copertina in /public */}
        <img className={styles.frameCover} src={src} alt="" />
        <div className={styles.card}>
          {owner.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto profilo già ridotta da Cloudinary
            <img className={styles.cardPhoto} src={owner.imageUrl} alt="" />
          ) : (
            <span className={styles.cardPhoto}>{initials(owner.name) || "P"}</span>
          )}
          <span className={styles.cardText}>
            <span className={styles.cardName}>{owner.name || "Il tuo nome"}</span>
            {owner.subtitle ? <span className={styles.cardSub}>{owner.subtitle}</span> : null}
          </span>
          {/* Il resto del riquadro (descrizione, pulsanti) solo accennato. */}
          <span className={styles.cardLines} aria-hidden="true">
            <i />
            <i />
          </span>
        </div>
      </div>
      <figcaption className={styles.caption}>{phone ? "Da telefono" : "Da computer"}</figcaption>
    </figure>
  );
}

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
  owner,
  value,
  onChange,
}: {
  token: string;
  /** Falso al primissimo profilo: la copertina si aggiunge dopo il primo salvataggio. */
  canEdit: boolean;
  categorySlugs: readonly string[];
  owner: CoverOwner;
  value: CoverValue;
  onChange: (value: CoverValue) => void;
}) {
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [busy, setBusy] = useState<"upload" | "preset" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Scorrendo in su": la copertina come la vede chi scorre in cima al profilo
  // (docs/changelog/2026-11-16-copertina-da-computer.md).
  const [scrolledUp, setScrolledUp] = useState(false);
  const src = profileCover(value)?.src ?? null;
  const presets = coverPresetsFor(categorySlugs);

  function handleFile(file: File) {
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
      <div className={styles.preview} aria-busy={busy === "upload"}>
        {src ? (
          <>
            <div className={styles.previewHead}>
              <p className={styles.previewTitle}>Come la vede il cliente</p>
              <div className={styles.segmented} role="group" aria-label="Momento della visita">
                <button type="button" className={styles.segment} aria-pressed={!scrolledUp} onClick={() => setScrolledUp(false)}>
                  All&apos;apertura
                </button>
                <button type="button" className={styles.segment} aria-pressed={scrolledUp} onClick={() => setScrolledUp(true)}>
                  Scorrendo in su
                </button>
              </div>
            </div>
            <div className={`${styles.views}${scrolledUp ? ` ${styles.viewsScrolled}` : ""}`}>
              <CustomerView src={src} owner={owner} phone={false} />
              <CustomerView src={src} owner={owner} phone />
            </div>
          </>
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
        <PhotoPicker
          accept="image/jpeg,image/png,image/webp"
          disabled={busy !== null}
          onFile={handleFile}
          trigger={(open) => (
            <Button variant="secondary" size="3" height={40} disabled={busy !== null} opacity={busy ? 0.6 : 1} onPress={open}>
              {value.coverImageUrl ? "Cambia foto" : "Carica una foto"}
            </Button>
          )}
        />
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
