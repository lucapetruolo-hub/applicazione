"use client";

import { useState, type CSSProperties, type MouseEventHandler } from "react";
import { Icon, brand } from "@professionisti/ui";
import { isVideoUrl, isDocumentUrl, documentTypeLabel } from "@/lib/media";

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
  forceDocument,
}: {
  url: string;
  alt?: string;
  style?: CSSProperties;
  onClick?: MouseEventHandler<HTMLImageElement | HTMLVideoElement | HTMLDivElement>;
  /**
   * Forza il tipo video indipendentemente dall'estensione dell'URL — serve
   * per gli URL `blob:` di un file selezionato ma non ancora caricato
   * (nessuna estensione riconoscibile da `isVideoUrl`, che guarda solo la
   * stringa dell'URL): il chiamante che conosce già il `File.type` reale lo
   * passa qui invece di lasciar indovinare all'URL.
   */
  forceVideo?: boolean;
  /** Stesso principio di `forceVideo`, per un documento (PDF/Word/Excel) selezionato ma non ancora caricato. */
  forceDocument?: boolean;
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

  // Un documento (PDF/Word/Excel, allegabile in chat — richiesta esplicita
  // dell'utente: "in modo che puo essere caricata anche la fattura o
  // ricevuta") non è un'immagine renderizzabile in un `<img>`: mostra
  // invece una tessera con icona + estensione, coerente col resto del
  // registro icone/token brand del prodotto.
  if (forceDocument || isDocumentUrl(url)) {
    return (
      <div
        style={{
          ...mergedStyle,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 2,
          backgroundColor: brand.gesso,
          cursor: onClick ? "pointer" : undefined,
        }}
        onClick={onClick as MouseEventHandler<HTMLDivElement>}
      >
        <Icon name="file-text" size={20} color={brand.cianografia} />
        <span style={{ fontSize: 9, fontWeight: 700, color: brand.grafite70 }}>{documentTypeLabel(url)}</span>
      </div>
    );
  }

  if (forceVideo || isVideoUrl(url)) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video src={url} muted playsInline onClick={onClick} style={mergedStyle} onError={() => setBroken(true)} />
    );
  }
  // `<img>` grezzo deliberato, non `next/image`: `url` può essere un
  // `blob:` locale (anteprima di un file selezionato ma non ancora
  // caricato, `forceVideo`/`forceDocument` esistono proprio per questo
  // caso) — non supportato dal loader di `next/image` — e questo
  // componente è usato in 13 punti del sito con dimensioni/aspect ratio
  // diversi passati via `style`, mai una dimensione nota in anticipo.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} onClick={onClick} style={mergedStyle} onError={() => setBroken(true)} />;
}
