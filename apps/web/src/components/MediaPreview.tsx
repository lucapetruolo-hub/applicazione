"use client";

import type { CSSProperties, MouseEventHandler } from "react";
import { isVideoUrl } from "@/lib/media";

const DEFAULT_STYLE: CSSProperties = { width: "100%", height: "100%", objectFit: "cover", display: "block" };

/**
 * Sostituto drop-in di `<img>` nelle griglie di miniature che ora possono
 * contenere anche video (richiesta esplicita dell'utente): stesso
 * riempimento di default (`objectFit: cover`, 100% del contenitore) usato
 * ovunque finora, con `style`/`onClick` opzionali per i pochi punti che
 * impostano dimensioni/bordo direttamente sull'elemento invece che su un
 * wrapper. `muted` + `playsInline` sul video: nessun autoplay sonoro
 * indesiderato in una griglia di miniature, e niente fullscreen forzato su
 * iOS al solo passaggio del mouse/tap.
 */
export function MediaPreview({
  url,
  alt = "",
  style,
  onClick,
}: {
  url: string;
  alt?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLImageElement | HTMLVideoElement>;
}) {
  const mergedStyle = { ...DEFAULT_STYLE, ...style };
  if (isVideoUrl(url)) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video src={url} muted playsInline onClick={onClick} style={mergedStyle} />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} onClick={onClick} style={mergedStyle} />;
}
