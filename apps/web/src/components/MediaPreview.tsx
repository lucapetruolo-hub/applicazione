"use client";

import { useState, type CSSProperties, type MouseEventHandler } from "react";
import { Icon, brand } from "@professionisti/ui";
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
 *
 * Fallback su errore di caricamento (URL Cloudinary scaduto/eliminato, foto
 * demo con hotlink rotto, ecc.): invece di lasciare l'icona di rottura
 * nativa del browser (segnalata come "dà un'impressione di sito non
 * finito" in un giro di revisione UX), mostra un riquadro neutro con
 * un'icona fotocamera — un solo `useState` locale, nessuna dipendenza dal
 * contesto (categoria, ecc.) del chiamante, per restare un drop-in valido
 * nei 13 punti del sito che già lo usano.
 */
export function MediaPreview({
  url,
  alt = "",
  style,
  onClick,
  forceVideo,
}: {
  url: string;
  alt?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLImageElement | HTMLVideoElement>;
  /**
   * Forza il tipo video indipendentemente dall'estensione dell'URL — serve
   * per gli URL `blob:` di un file selezionato ma non ancora caricato
   * (nessuna estensione riconoscibile da `isVideoUrl`, che guarda solo la
   * stringa dell'URL): il chiamante che conosce già il `File.type` reale lo
   * passa qui invece di lasciar indovinare all'URL.
   */
  forceVideo?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const mergedStyle = { ...DEFAULT_STYLE, ...style };

  if (broken) {
    return (
      <div
        style={{
          ...mergedStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: brand.gesso,
          cursor: onClick ? "pointer" : undefined,
        }}
        onClick={onClick as MouseEventHandler<HTMLDivElement>}
      >
        <Icon name="camera" size={20} color={brand.grafite70} />
      </div>
    );
  }

  if (forceVideo || isVideoUrl(url)) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video src={url} muted playsInline onClick={onClick} style={mergedStyle} onError={() => setBroken(true)} />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} onClick={onClick} style={mergedStyle} onError={() => setBroken(true)} />;
}
