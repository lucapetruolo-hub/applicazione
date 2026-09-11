"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { ConversationEvent } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { MediaPreview } from "@/components/MediaPreview";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { UploadingDots } from "@/components/UploadingDots";
import { cloudinaryDownloadUrl, documentTypeLabel, isDocumentUrl } from "@/lib/media";

// Documenti accettati dall'opzione "File" del menu allegati (richiesta
// esplicita dell'utente: "in modo che puo essere caricata anche la fattura
// o ricevuta") — stesso elenco chiuso già validato lato server
// (ALLOWED_TIMELINE_DOCUMENT_MIME_TYPES, guided-requests.controller.ts).
const DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx";

const MAX_UPDATE_MEDIA = 5;
// Intervallo di polling mentre il popup è aperto (richiesta esplicita
// dell'utente: "la chat deve aggiornarsi real time, in modo da poter avere
// una conversazione fluida") — abbastanza breve da sembrare una chat vera,
// non così breve da martellare l'API per un popup che può restare aperto a
// lungo durante una conversazione.
const TIMELINE_POLL_MS = 4000;

const ACTOR_LABEL: Record<ConversationEvent["actor"], string> = {
  CLIENT: "Cliente",
  PROFESSIONAL: "Professionista",
  SYSTEM: "Sistema",
};

const ACTOR_COLOR: Record<ConversationEvent["actor"], string> = {
  CLIENT: brand.cianografiaScuro,
  PROFESSIONAL: brand.verificato,
  SYSTEM: brand.grafite70,
};

// Sfondo "nuvoletta" per attore — richiesta esplicita dell'utente ("crea
// una sorta di nuvoletta colorata, differenziando i colori in base a se è
// il cliente e professionista"). Due tinte già esistenti nella palette,
// nessun nuovo token: `cianografiaVelo` (verde menta, stesso accento già
// usato per l'etichetta "Cliente") e `gesso` (pesca chiaro, già lo sfondo
// pagina — qui riusato come tinta neutra distinta dal verde, non
// `ottone`: quel colore è riservato ai soli contesti di pagamento/boost,
// CLAUDE.md).
const ACTOR_BUBBLE_BG: Record<ConversationEvent["actor"], string> = {
  CLIENT: brand.cianografiaVelo,
  PROFESSIONAL: brand.gesso,
  SYSTEM: "transparent",
};

/** Data+ora reale di un evento della cronologia, fuso orario del browser (timestamp vero, non "wall clock UTC" delle fasce agenda). */
function formatEventDate(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })} alle ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Cronologia completa cliente↔professionista di una richiesta guidata
 * (richiesta esplicita dell'utente: "tieni traccia delle varie
 * conversazioni e aggiornamenti... così ognuno cliccando ad esempio sul
 * preventivo possa vedere la cronologia completa di quello che è successo
 * con le date dei vari aggiornamenti e il testo"). Stesso pattern overlay
 * DOM grezzo già in uso per BookingDetailPanel/ClientProfileModal
 * (`role="dialog"`, chiusura con Escape/click sul backdrop). Usato sia dal
 * cliente che dal professionista: `professionalProfileId` identifica il
 * thread (una richiesta guidata può aver raggiunto più professionisti), il
 * backend verifica l'accesso e determina l'attore per un nuovo aggiornamento.
 */
export function TimelineModal({
  token,
  guidedRequestId,
  professionalProfileId,
  viewerRole,
  otherPartyName,
  onOpenClientProfile,
  onClose,
}: {
  token: string;
  guidedRequestId: string;
  professionalProfileId: string;
  /** Determina quale lato del popup mostra i messaggi di chi sta guardando
      (richiesta esplicita dell'utente: "sulla parte sinistra ci saranno
      gli aggiornamenti dell'altra parte") — i messaggi SYSTEM restano
      sempre centrati, non hanno un "lato". */
  viewerRole: "CLIENT" | "PROFESSIONAL";
  /**
   * Nome reale dell'altra parte del thread (nome+cognome del cliente se
   * `viewerRole` è "PROFESSIONAL", nome attività del professionista se è
   * "CLIENT") — richiesta esplicita dell'utente: "al posto di cliente e
   * professionista deve esserci scritto il nome esatto". Ogni chiamante lo
   * ha già a disposizione nei propri dati (nessuna nuova chiamata API).
   * `null`/assente ricade sull'etichetta generica "Cliente"/"Professionista"
   * (es. account eliminato, dato non ancora noto).
   */
  otherPartyName?: string | null;
  /**
   * Richiesta esplicita dell'utente: "se si clicca sul nome del cliente...
   * deve aprirsi la pagina relativa" — il cliente non ha un profilo
   * pubblico in questo marketplace (solo i professionisti ne hanno uno,
   * CLAUDE.md §20/§45), quindi "la pagina relativa" è la stessa
   * `ClientProfileModal` già usata altrove per lo stesso identico cliente
   * (es. `RequestCard`, `/dashboard/richieste`) — passata dal chiamante
   * che ha già i dati per aprirla, mai duplicata qui. Assente (nessun
   * click) nei punti dove il viewer è il cliente stesso (`le-mie-
   * richieste`, "Cliente" è "me") o dove il chiamante non ha ancora
   * l'identità del cliente a disposizione.
   */
  onOpenClientProfile?: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  // Il proprio nome (per le nuvolette del lato "mio") si ricava
  // dall'account loggato — stesso fallback già in uso in AccountMenu per
  // un professionista senza ancora businessName. L'altra parte arriva da
  // `otherPartyName` (prop), il chiamante specifico del thread la conosce
  // già.
  const myDisplayName =
    viewerRole === "PROFESSIONAL"
      ? user?.businessName ?? user?.name ?? null
      : [user?.name, user?.surname].filter(Boolean).join(" ") || user?.name || null;
  function displayNameFor(actor: ConversationEvent["actor"]): string {
    if (actor === "SYSTEM") return ACTOR_LABEL.SYSTEM;
    const name = actor === viewerRole ? myDisplayName : otherPartyName;
    return name && name.trim() ? name : ACTOR_LABEL[actor];
  }

  const [events, setEvents] = useState<ConversationEvent[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [openPhoto, setOpenPhoto] = useState<{ photos: string[]; index: number } | null>(null);
  // Tre input distinti al posto di un unico "+" (richiesta esplicita
  // dell'utente: "al posto del file più, metti il simbolo di una graffetta
  // per allegare, e fai selezionare: fotocamera, foto/video, File"):
  // stesso `handleMediaChange` per tutti e tre, solo `accept`/`capture`
  // cambia — il backend valida comunque il tipo reale del file caricato.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const attachMenuContainerRef = useRef<HTMLDivElement>(null);
  // Fotocamera vera sia da telefono che da computer (richiesta esplicita
  // dell'utente: "devi aprire la fotocamera del telefono o del computer").
  // Su un telefono, `cameraInputRef` con `capture="environment"` apre già
  // l'app fotocamera nativa del sistema operativo — è il modo più
  // affidabile, nessuna interfaccia da costruire. Su un computer, quello
  // stesso attributo non ha alcun effetto garantito (non esiste un'app
  // fotocamera di sistema equivalente per ogni browser/OS): serve una vera
  // cattura in-app via `getUserMedia`. `videoRef`/`cameraStream`/
  // `cameraError` sostengono l'overlay `CameraCaptureOverlay` più sotto in
  // questo file, montato solo su richiesta (mai un permesso fotocamera
  // chiesto in anticipo senza un'azione esplicita dell'utente).
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);

  function stopCameraStream() {
    cameraStream?.getTracks().forEach((track) => track.stop());
    setCameraStream(null);
  }

  async function handleCameraOption() {
    setIsAttachMenuOpen(false);
    // Stesso principio "touch primario" già in uso altrove nel progetto
    // per distinguere telefono/computer — un telefono ha già un'app
    // fotocamera di sistema più affidabile di qualunque overlay costruito
    // qui, un computer no.
    const isMobile =
      typeof navigator !== "undefined" && (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || navigator.maxTouchPoints > 2);
    if (isMobile) {
      cameraInputRef.current?.click();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // Nessuna webcam API disponibile (browser molto vecchio, contesto non
      // sicuro): ripiega sul selettore file nativo invece di restare bloccati
      // su un'azione che non può funzionare.
      cameraInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setCameraStream(stream);
    } catch {
      // Permesso negato o nessuna webcam collegata: stesso ripiego sul
      // selettore file nativo, mai lasciare l'utente bloccato su un errore
      // senza alternativa.
      cameraInputRef.current?.click();
    }
  }

  useEffect(() => {
    if (videoRef.current && cameraStream) videoRef.current.srcObject = cameraStream;
  }, [cameraStream]);

  useEffect(() => stopCameraStream, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    stopCameraStream();
    if (!blob) {
      setMediaError("Impossibile catturare la foto dalla fotocamera.");
      return;
    }
    await uploadFile(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
  }
  // Popup ad altezza fissata (`maxHeight="85vh"` sulla card) con SOLO la
  // regione messaggi scorrevole al suo interno — non più l'intero popup
  // dentro il backdrop (bug reale segnalato dall'utente: "rendendola più
  // fruibile sia da mobile che desktop" + una cronologia lunga che
  // "ritornava automaticamente in cima"). Intestazione e modulo di invio
  // restano sempre visibili, ancorati sopra/sotto — pattern di chat
  // standard, più leggibile su schermi piccoli di quanto non fosse far
  // scrollare l'intera pagina/popup come un unico blocco (il vecchio
  // approccio, CLAUDE.md §35, risolveva un bug diverso — il contenuto più
  // alto del viewport non raggiungibile — che qui non si presenta più per
  // costruzione: la card non supera mai l'85% dell'altezza del viewport).
  // `bottomRef` è la sentinella di fondo della lista messaggi,
  // `scrollContainerRef` il div che scrolla davvero — serve per capire se
  // l'utente è già vicino al fondo prima di un aggiornamento ricevuto dal
  // poll: se ha scrollato in su per rileggere la cronologia, un nuovo
  // messaggio non deve strappargli via la posizione.
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const lastEventIdRef = useRef<string | null>(null);

  function isNearBottom(): boolean {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  }

  useEffect(() => {
    apiClient
      .guidedRequestTimeline(token, guidedRequestId, professionalProfileId)
      .then((fresh) => {
        setEvents(fresh);
        lastEventIdRef.current = fresh[fresh.length - 1]?.id ?? null;
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Errore nel caricamento della cronologia."));
  }, [token, guidedRequestId, professionalProfileId]);

  // Poll periodico mentre il popup resta aperto (richiesta esplicita
  // dell'utente: "la chat deve aggiornarsi real time"): confronta solo
  // l'id dell'ultimo evento per evitare un re-render ad ogni tick quando
  // non è cambiato nulla — un semplice refetch completo, nessun endpoint
  // "solo i nuovi" introdotto apposta (la cronologia di una singola
  // richiesta resta piccola, coerente con la scala di lancio, CLAUDE.md
  // §7).
  useEffect(() => {
    const interval = setInterval(() => {
      apiClient
        .guidedRequestTimeline(token, guidedRequestId, professionalProfileId)
        .then((fresh) => {
          const freshLastId = fresh[fresh.length - 1]?.id ?? null;
          // Bug reale corretto: il confronto includeva anche `fresh.length
          // === (events?.length ?? 0)`, ma `events` qui è la chiusura
          // "stale" del render in cui questo effetto è stato creato (mai
          // aggiornata, l'effetto non ha `events` tra le dipendenze) —
          // restava sempre `null`/0 per tutta la vita del popup, quindi
          // quella metà del confronto era quasi sempre falsa e
          // `setEvents(fresh)` scattava ad OGNI tick anche senza alcun
          // messaggio nuovo. Segnalato dall'utente come "la chat torna
          // automaticamente in cima" su una cronologia lunga: ogni
          // set inutile riattivava l'effetto di scroll sotto. Il solo
          // confronto sull'id dell'ultimo evento (`lastEventIdRef`, un ref,
          // mai stale) basta: i messaggi non vengono mai modificati/
          // cancellati dopo l'invio, un id di coda diverso è l'unico modo
          // in cui la cronologia può davvero cambiare.
          if (freshLastId === lastEventIdRef.current) return;
          lastEventIdRef.current = freshLastId;
          setEvents(fresh);
        })
        .catch(() => {});
    }, TIMELINE_POLL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, guidedRequestId, professionalProfileId]);

  useEffect(() => {
    if (!events) return;
    if (shouldAutoScrollRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [events]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // Stesso principio già in uso per `openPhoto`: un Escape mentre la
      // cattura fotocamera è aperta deve chiudere solo quella, non anche
      // il popup sottostante (stesso bug del "doppio Escape" già corretto
      // altrove in questo file per PhotoLightbox/BookingDetailPanel).
      if (cameraStream) {
        stopCameraStream();
        return;
      }
      if (!openPhoto) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose, openPhoto, cameraStream]);

  useEffect(() => {
    if (!isAttachMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (attachMenuContainerRef.current && !attachMenuContainerRef.current.contains(event.target as Node)) {
        setIsAttachMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isAttachMenuOpen]);

  // Estratto da `handleMediaChange` (che resta il gestore dei tre `<input
  // type="file">`): riusato anche dalla cattura fotocamera desktop
  // (`CameraCaptureOverlay`, sotto), che produce un `File` senza passare
  // da un `<input>` — stessa identica pipeline di upload/errore per
  // entrambe le sorgenti.
  async function uploadFile(file: File) {
    setMediaError(null);
    setIsUploadingMedia(true);
    try {
      const result = await apiClient.uploadTimelinePhoto(token, file);
      setMediaUrls((prev) => [...prev, result.imageUrl].slice(0, MAX_UPDATE_MEDIA));
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Errore durante il caricamento del file.");
    } finally {
      setIsUploadingMedia(false);
    }
  }

  async function handleMediaChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadFile(file);
  }

  function removeMedia(url: string) {
    setMediaUrls((prev) => prev.filter((u) => u !== url));
  }

  // Click su una miniatura di un evento: un documento (PDF/Word/Excel) non
  // è "ingrandibile" in un lightbox fatto per immagini/video — richiesta
  // esplicita dell'utente: deve poter essere scaricato da chi lo riceve,
  // non solo aperto in anteprima (un PDF si apriva prima nel visualizzatore
  // integrato del browser in una nuova scheda, senza un vero salvataggio).
  // Un `<a download>` creato al volo, con `fl_attachment` (Cloudinary,
  // `cloudinaryDownloadUrl`) forza il download anche cross-origine, dove il
  // solo attributo HTML `download` non è garantito da ogni browser. Le sole
  // foto/video dell'evento restano navigabili in `PhotoLightbox` (indice
  // ricalcolato sul solo sottoinsieme visualizzabile, un documento
  // eventualmente presente nello stesso evento non fa mai parte del
  // carosello).
  function openMediaAt(urls: string[], url: string) {
    if (isDocumentUrl(url)) {
      const link = document.createElement("a");
      link.href = cloudinaryDownloadUrl(url);
      link.download = `allegato.${documentTypeLabel(url).toLowerCase()}`;
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }
    const viewable = urls.filter((u) => !isDocumentUrl(u));
    const index = viewable.indexOf(url);
    setOpenPhoto({ photos: viewable, index: index === -1 ? 0 : index });
  }

  async function handleSubmit() {
    if (!message.trim() && mediaUrls.length === 0) {
      setSubmitError("Scrivi un messaggio o allega almeno una foto/video.");
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const created = await apiClient.addTimelineUpdate(token, guidedRequestId, { professionalProfileId, message, mediaUrls });
      lastEventIdRef.current = created.id;
      shouldAutoScrollRef.current = true;
      setEvents((prev) => [...(prev ?? []), created]);
      setMessage("");
      setMediaUrls([]);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Errore durante l'invio dell'aggiornamento.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Cronologia della richiesta"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(20,24,30,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
      }}
    >
      <YStack
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={520}
        maxHeight="85vh"
        backgroundColor={brand.calce}
        borderRadius="$3"
        overflow="hidden"
      >
        <XStack justifyContent="space-between" alignItems="center" flexShrink={0} paddingHorizontal="$5" paddingTop="$5" paddingBottom="$3">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Cronologia della richiesta
          </Text>
          <Text fontSize="$5" color={brand.grafite70} cursor="pointer" onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi">
            ✕
          </Text>
        </XStack>

        {/* Unica regione scorrevole del popup (richiesta esplicita
            dell'utente: "rendendola più fruibile sia da mobile che
            desktop") — intestazione e modulo di invio restano sempre
            visibili sopra/sotto, come in una chat vera, invece di
            scorrere via insieme ai messaggi su una cronologia lunga. */}
        <div
          ref={scrollContainerRef}
          onScroll={() => {
            shouldAutoScrollRef.current = isNearBottom();
          }}
          style={{ flex: 1, overflowY: "auto", paddingLeft: 20, paddingRight: 20, minHeight: 0 }}
        >
          <YStack gap="$3" paddingBottom="$2">
            {loadError ? (
              <Text color={brand.urgenza} fontSize="$3">
                {loadError}
              </Text>
            ) : events === null ? (
              <Text color={brand.grafite70} fontSize="$3">
                Caricamento...
              </Text>
            ) : events.length === 0 ? (
              <Text color={brand.grafite70} fontSize="$3">
                Nessun aggiornamento ancora.
              </Text>
            ) : (
              events.map((event) => {
                if (event.actor === "SYSTEM") {
                  // Eventi automatici (fan-out, scadenze, ecc.): mai un
                  // "lato", restano centrati e discreti — non sono un
                  // messaggio di nessuna delle due parti.
                  return (
                    <YStack key={event.id} gap="$1" alignItems="center">
                      <Text fontSize={11} color={brand.grafite70} textAlign="center">
                        {event.message}
                      </Text>
                      <Text fontSize={10} color={brand.grafite70}>
                        {formatEventDate(event.createdAt)}
                      </Text>
                    </YStack>
                  );
                }
                // I messaggi di chi sta guardando vanno a destra (come in
                // qualunque chat), quelli dell'altra parte a sinistra —
                // richiesta esplicita dell'utente.
                const isMine = event.actor === viewerRole;
                // Nome cliccabile → "la pagina relativa" (richiesta esplicita
                // dell'utente): il professionista ha sempre un profilo
                // pubblico reale (`professionalProfileId` è già garantito da
                // ogni chiamante); il cliente no, quindi lì il click esiste
                // solo se il chiamante ha passato `onOpenClientProfile` (ha
                // già i dati per aprire la stessa scheda usata altrove).
                const nameOnPress =
                  event.actor === "PROFESSIONAL"
                    ? () => router.push(`/professionista/${professionalProfileId}`)
                    : event.actor === "CLIENT" && onOpenClientProfile
                      ? onOpenClientProfile
                      : undefined;
                return (
                  <YStack key={event.id} alignItems={isMine ? "flex-end" : "flex-start"} gap={2}>
                    <YStack
                      gap="$1.5"
                      maxWidth="85%"
                      backgroundColor={ACTOR_BUBBLE_BG[event.actor]}
                      borderRadius="$4"
                      borderTopRightRadius={isMine ? 4 : undefined}
                      borderTopLeftRadius={isMine ? undefined : 4}
                      paddingHorizontal="$3"
                      paddingVertical="$2.5"
                    >
                      <Text
                        fontFamily="$body"
                        fontWeight="700"
                        fontSize={11}
                        color={ACTOR_COLOR[event.actor]}
                        textDecorationLine={nameOnPress ? "underline" : undefined}
                        cursor={nameOnPress ? "pointer" : undefined}
                        onPress={nameOnPress}
                        accessibilityRole={nameOnPress ? "button" : undefined}
                      >
                        {displayNameFor(event.actor)}
                      </Text>
                      {event.message ? (
                        <Text color={brand.grafite} fontSize="$3">
                          {event.message}
                        </Text>
                      ) : null}
                      {event.mediaUrls.length > 0 ? (
                        <XStack gap="$2" flexWrap="wrap">
                          {event.mediaUrls.map((url) => (
                            <MediaPreview
                              key={url}
                              url={url}
                              onClick={() => openMediaAt(event.mediaUrls, url)}
                              style={{ width: 64, height: 64, borderRadius: 4, cursor: "pointer", border: `1px solid ${brand.filetto}` }}
                            />
                          ))}
                        </XStack>
                      ) : null}
                    </YStack>
                    <Text fontSize={10} color={brand.grafite70} paddingHorizontal="$1">
                      {formatEventDate(event.createdAt)}
                    </Text>
                  </YStack>
                );
              })
            )}
            <div ref={bottomRef} />
          </YStack>
        </div>

        <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingHorizontal="$5" paddingTop="$3" paddingBottom="$5" flexShrink={0}>
          <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
            Scrivi un aggiornamento
          </Text>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Es. ho ordinato il pezzo di ricambio, arriverà lunedì..."
            rows={3}
            maxLength={2000}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 4,
              border: `1px solid ${brand.filetto}`,
              fontSize: 14,
              fontFamily: "inherit",
              color: brand.grafite,
              resize: "vertical",
            }}
          />
          <XStack gap="$2" flexWrap="wrap">
            {mediaUrls.map((url) => (
              <YStack key={url} width={56} height={56} borderRadius="$2" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
                {/* Bug reale corretto: l'anteprima di un file appena
                    allegato (non ancora inviato) non aveva alcun
                    `onClick` — un documento restava "muto" al click invece
                    di scaricarsi (segnalato dall'utente: "quando si
                    inserisce un file nella chat, non la fa scaricare").
                    Stesso `openMediaAt` già in uso per i messaggi inviati:
                    scarica se è un documento, apre il lightbox se è
                    foto/video — qui applicato sulla sola lista `mediaUrls`
                    del composer invece che su quella di un evento. */}
                <MediaPreview url={url} onClick={() => openMediaAt(mediaUrls, url)} style={{ cursor: "pointer" }} />
                <YStack
                  position="absolute"
                  top={2}
                  right={2}
                  width={18}
                  height={18}
                  borderRadius={9}
                  backgroundColor="rgba(20,24,30,0.7)"
                  alignItems="center"
                  justifyContent="center"
                  cursor="pointer"
                  onPress={() => removeMedia(url)}
                  accessibilityRole="button"
                  accessibilityLabel="Rimuovi foto"
                >
                  <Icon name="x" size={11} color="white" strokeWidth={2} />
                </YStack>
              </YStack>
            ))}
            {mediaUrls.length < MAX_UPDATE_MEDIA ? (
              // Graffetta + menu (richiesta esplicita dell'utente: "al
              // posto del file più, metti il simbolo di una graffetta per
              // allegare, e fai selezionare: fotocamera, foto/video, File.
              // in modo che puo essere caricata anche la fattura o
              // ricevuta") — sostituisce il vecchio tasto "+" con un unico
              // input nascosto. Menu aperto verso l'alto (`bottom="100%"`):
              // il tasto vive in fondo al popup, un menu verso il basso
              // rischierebbe di finire tagliato dal bordo della card.
              <YStack ref={attachMenuContainerRef} position="relative">
                <YStack
                  width={56}
                  height={56}
                  borderRadius="$2"
                  borderWidth={1}
                  borderColor={brand.filetto}
                  borderStyle="dashed"
                  alignItems="center"
                  justifyContent="center"
                  cursor="pointer"
                  opacity={isUploadingMedia ? 0.6 : 1}
                  onPress={() => !isUploadingMedia && setIsAttachMenuOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityLabel="Allega foto, video o documento"
                >
                  {isUploadingMedia ? (
                    <UploadingDots dotSize={5} />
                  ) : (
                    <Icon name="paperclip" size={20} color={brand.grafite70} />
                  )}
                </YStack>

                {isAttachMenuOpen ? (
                  <YStack
                    position="absolute"
                    bottom="100%"
                    left={0}
                    marginBottom="$2"
                    minWidth={190}
                    backgroundColor={brand.calce}
                    borderRadius="$3"
                    overflow="hidden"
                    zIndex={1200}
                    shadowColor="rgba(43,32,19,0.16)"
                    shadowRadius={14}
                    shadowOffset={{ width: 0, height: 6 }}
                    shadowOpacity={1}
                  >
                    {[
                      {
                        icon: "camera" as const,
                        label: "Fotocamera",
                        onPress: () => {
                          void handleCameraOption();
                        },
                      },
                      {
                        icon: "video" as const,
                        label: "Foto o video",
                        onPress: () => {
                          setIsAttachMenuOpen(false);
                          galleryInputRef.current?.click();
                        },
                      },
                      {
                        icon: "file-text" as const,
                        label: "File",
                        onPress: () => {
                          setIsAttachMenuOpen(false);
                          documentInputRef.current?.click();
                        },
                      },
                    ].map((item) => (
                      <XStack
                        key={item.label}
                        paddingHorizontal="$4"
                        paddingVertical="$3"
                        alignItems="center"
                        gap="$2"
                        cursor="pointer"
                        hoverStyle={{ backgroundColor: brand.gesso }}
                        onPress={item.onPress}
                        accessibilityRole="button"
                      >
                        <Icon name={item.icon} size={16} color={brand.grafite} />
                        <Text fontSize="$3" color={brand.grafite} fontWeight="600">
                          {item.label}
                        </Text>
                      </XStack>
                    ))}
                  </YStack>
                ) : null}
              </YStack>
            ) : null}
          </XStack>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleMediaChange}
            disabled={isUploadingMedia}
            style={{ display: "none" }}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handleMediaChange}
            disabled={isUploadingMedia}
            style={{ display: "none" }}
          />
          <input
            ref={documentInputRef}
            type="file"
            accept={DOCUMENT_ACCEPT}
            onChange={handleMediaChange}
            disabled={isUploadingMedia}
            style={{ display: "none" }}
          />
          {mediaError ? (
            <Text color={brand.urgenza} fontSize="$2">
              {mediaError}
            </Text>
          ) : null}
          {submitError ? (
            <Text color={brand.urgenza} fontSize="$2">
              {submitError}
            </Text>
          ) : null}
          <Button
            variant="primary"
            size="$3"
            height={40}
            alignSelf="flex-start"
            disabled={isSubmitting || isUploadingMedia}
            opacity={isSubmitting || isUploadingMedia ? 0.6 : 1}
            onPress={handleSubmit}
          >
            {isSubmitting ? "Invio..." : "Invia aggiornamento"}
          </Button>
        </YStack>
      </YStack>

      {openPhoto ? <PhotoLightbox photos={openPhoto.photos} initialIndex={openPhoto.index} onClose={() => setOpenPhoto(null)} /> : null}

      {cameraStream ? (
        // Cattura webcam da computer, stesso pattern overlay DOM grezzo già
        // in uso altrove nel prodotto (`role="dialog"`, chiusura su
        // Escape/click sul backdrop) — sopra a `TimelineModal` stesso
        // (z-index maggiore), unico modo di restare visibile sopra un
        // popup già aperto.
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            // Sempre `stopPropagation`, non solo su target===currentTarget:
            // questo overlay vive annidato dentro il `<div role="dialog"
            // onClick={onClose}>` di TimelineModal stesso (nessun click sul
            // backdrop reale lì, chiude su qualunque click che gli
            // arrivi) — senza fermare la bolla qui, cliccare "Scatta
            // foto"/"Annulla" (o qualunque punto di questo overlay)
            // richiudeva anche il popup sottostante per intero, bug reale
            // riprodotto con Playwright durante la verifica.
            e.stopPropagation();
            if (e.target === e.currentTarget) stopCameraStream();
          }}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(43,32,19,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
            padding: 16,
          }}
        >
          <YStack backgroundColor={brand.calce} borderRadius="$4" padding="$4" gap="$3" maxWidth={480} width="100%">
            <Text fontSize="$4" fontWeight="700" color={brand.grafite}>
              Scatta una foto
            </Text>
            <div style={{ borderRadius: 8, overflow: "hidden", backgroundColor: "#000" }}>
              <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", display: "block" }} />
            </div>
            <XStack gap="$3" justifyContent="flex-end">
              <Button variant="ghost" onPress={stopCameraStream}>
                Annulla
              </Button>
              <Button variant="primary" onPress={capturePhoto}>
                Scatta foto
              </Button>
            </XStack>
          </YStack>
        </div>
      ) : null}
    </div>
  );
}
