"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { ConversationEvent } from "@professionisti/shared";
import { Avatar, Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { subscribeRealtimeEvents } from "@/lib/realtimeBus";
import { MediaPreview } from "@/components/MediaPreview";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { UploadingDots } from "@/components/UploadingDots";
import { attachmentFileName, documentTypeLabel, isDocumentUrl } from "@/lib/media";

// Documenti accettati dall'opzione "File" del menu allegati (richiesta
// esplicita dell'utente: "in modo che puo essere caricata anche la fattura
// o ricevuta") — stesso elenco chiuso già validato lato server
// (ALLOWED_TIMELINE_DOCUMENT_MIME_TYPES, guided-requests.controller.ts).
const DOCUMENT_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx";

const MAX_UPDATE_MEDIA = 5;
// Poll di riserva mentre la conversazione resta aperta — non più la sola
// fonte di aggiornamento (CTO: "socket.io vs websocket vs alternative",
// SSE scelta per questo stadio del progetto): un nuovo messaggio arriva
// ora quasi istantaneo via `realtimeBus`/`AuthContext`, il poll resta solo
// come rete di sicurezza per una disconnessione SSE momentanea — intervallo
// allungato di conseguenza rispetto a prima (era 4s, l'unica fonte allora).
const TIMELINE_POLL_MS = 20_000;

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
 * Corpo della cronologia cliente↔professionista di una richiesta guidata —
 * estratto da `TimelineModal` (che ora ne resta un thin wrapper per i 5
 * mount point esistenti come popup, CLAUDE.md) per essere riusabile anche
 * **inline**, senza backdrop, nel pannello di conversazione della pagina
 * `/chat` (richiesta esplicita dell'utente: "quando si clicca su una chat
 * non deve aprirsi piu come popup ma aprirlo sulla parte restante dello
 * schermo"). Riempie sempre il proprio contenitore (`width/height: 100%`),
 * mai una dimensione propria fissa — la sceglie chi la monta (un popup con
 * `maxWidth`/`maxHeight`, o un pannello a piena altezza).
 */
export function ConversationView({
  token,
  guidedRequestId,
  professionalProfileId,
  viewerRole,
  otherPartyName,
  otherPartyImageUrl,
  onOpenClientProfile,
  onBack,
  backIcon = "x",
  escapeToBack = false,
  title = "Cronologia della richiesta",
}: {
  token: string;
  guidedRequestId: string;
  professionalProfileId: string;
  /** Determina quale lato mostra i messaggi di chi sta guardando (richiesta
      esplicita dell'utente: "sulla parte sinistra ci saranno gli
      aggiornamenti dell'altra parte") — i messaggi SYSTEM restano sempre
      centrati, non hanno un "lato". */
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
  /** Mostrata nell'intestazione (richiesta esplicita dell'utente per la pagina /chat: "nome e ultimo messaggio... sulla parte sinistra", l'intestazione del pannello ripete lo stesso nome per chiarezza). */
  otherPartyImageUrl?: string | null;
  /**
   * Richiesta esplicita dell'utente: "se si clicca sul nome del cliente...
   * deve aprirsi la pagina relativa" — il cliente non ha un profilo
   * pubblico in questo marketplace (solo i professionisti ne hanno uno,
   * CLAUDE.md §20/§45), quindi "la pagina relativa" è la stessa
   * `ClientProfileModal` già usata altrove per lo stesso identico cliente
   * (es. `RequestCard`, `/dashboard/richieste`) — passata dal chiamante
   * che ha già i dati per aprirla, mai duplicata qui.
   */
  onOpenClientProfile?: () => void;
  /** Controllo indietro/chiudi nell'intestazione — "✕" per un popup (TimelineModal), freccetta "←" per il pannello a schermo intero da mobile (richiesta esplicita dell'utente). Assente (nessun controllo) quando la vista non ha una "chiusura" ovvia, es. il pannello desktop della pagina /chat. */
  onBack?: () => void;
  backIcon?: "x" | "chevron-left";
  /** Solo per l'uso a popup (TimelineModal): Escape chiude. Il pannello inline della pagina /chat non lo attiva — Escape mentre si scrive un messaggio non deve far perdere la bozza uscendo dalla conversazione. */
  escapeToBack?: boolean;
  title?: string;
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

  // Push in tempo reale (CTO — SSE): un evento "chat_message" per QUESTA
  // esatta coppia richiesta+professionista viene aggiunto subito, senza
  // aspettare il poll di riserva sotto. Deduplicato per id (lo stesso
  // evento potrebbe comunque arrivare anche dal poll in un giro di
  // sovrapposizione — mai un doppio messaggio a schermo).
  useEffect(() => {
    return subscribeRealtimeEvents((realtimeEvent) => {
      if (realtimeEvent.kind !== "chat_message") return;
      if (realtimeEvent.guidedRequestId !== guidedRequestId || realtimeEvent.professionalProfileId !== professionalProfileId) return;
      setEvents((prev) => {
        if (prev?.some((e) => e.id === realtimeEvent.event.id)) return prev;
        lastEventIdRef.current = realtimeEvent.event.id;
        shouldAutoScrollRef.current = isNearBottom();
        return [...(prev ?? []), realtimeEvent.event];
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidedRequestId, professionalProfileId]);

  // Poll di riserva (vedi TIMELINE_POLL_MS sopra): confronta solo l'id
  // dell'ultimo evento per evitare un re-render ad ogni tick quando non è
  // cambiato nulla — refetch completo, nessun endpoint "solo i nuovi"
  // introdotto apposta (la cronologia di una singola richiesta resta
  // piccola, CLAUDE.md §7).
  useEffect(() => {
    const interval = setInterval(() => {
      apiClient
        .guidedRequestTimeline(token, guidedRequestId, professionalProfileId)
        .then((fresh) => {
          const freshLastId = fresh[fresh.length - 1]?.id ?? null;
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
      // il resto (stesso bug del "doppio Escape" già corretto altrove per
      // PhotoLightbox/BookingDetailPanel).
      if (cameraStream) {
        stopCameraStream();
        return;
      }
      if (escapeToBack && !openPhoto) onBack?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBack, escapeToBack, openPhoto, cameraStream]);

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
  // non solo aperto in anteprima. Le sole foto/video dell'evento restano
  // navigabili in `PhotoLightbox`. Passa dal nostro stesso backend
  // (`apiClient.downloadTimelineAttachment`, proxy server-to-server con
  // `Content-Disposition: attachment` impostato da noi): il blob risultante
  // è scaricato da un URL `blob:`, sempre trattato come "stessa origine" da
  // qualunque browser — nessuna dipendenza dal comportamento della CDN
  // esterna.
  async function openMediaAt(urls: string[], url: string) {
    if (isDocumentUrl(url)) {
      setMediaError(null);
      try {
        const { blob, filename } = await apiClient.downloadTimelineAttachment(token, url);
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 4000);
      } catch (err) {
        setMediaError(err instanceof Error ? err.message : "Impossibile scaricare il file.");
      }
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
      // Deduplicato per id, stesso principio del push SSE sopra: il
      // backend pubblica l'evento "chat_message" a ENTRAMBE le parti del
      // thread, incluso chi lo ha appena inviato (`TimelineService.
      // publishChatMessage`) — se l'eco SSE del proprio messaggio arriva
      // prima che questa POST si risolva, senza questo controllo il
      // messaggio veniva aggiunto due volte (bug reale segnalato
      // dall'utente: "quando invio un messaggio lo invia due volte").
      setEvents((prev) => (prev?.some((e) => e.id === created.id) ? prev : [...(prev ?? []), created]));
      setMessage("");
      setMediaUrls([]);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Errore durante l'invio dell'aggiornamento.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    // `flex={1}` + `minHeight={0}`, non `height="100%"` (bug reale
    // segnalato dall'utente: "le chat che sono rimaste popup... non
    // viene visualizzata correttamente" da /dashboard/richieste e
    // dall'agenda). `height:"100%"` è un'unità percentuale: si risolve
    // solo contro un antenato con un'altezza DEFINITA, non contro uno che
    // ha solo `maxHeight` (il caso di `TimelineModal.tsx`, che imposta
    // solo `maxHeight="85vh"` sul contenitore del popup, mai un `height`
    // esplicito) — per spec CSS quell'antenato resta "auto" agli occhi
    // del calcolo percentuale, quindi il 100% veniva ignorato e questo
    // YStack cresceva alla sua altezza naturale di contenuto (verificato:
    // oltre 1100px con una decina di messaggi, contro i 765px disponibili
    // del popup), tagliato a metà da `overflow:hidden` del genitore —
    // intestazione e casella di invio finivano fuori dall'area visibile.
    // `flex:1` non ha questo problema: si distribuisce sempre contro
    // l'altezza EFFETTIVA (già vincolata da `maxHeight`) del contenitore
    // flex padre, funziona identico sia qui (popup) sia nel pannello
    // inline di `/chat` (altezza vera in px/vh su `.chat-conversation-pane`,
    // mai stato rotto lì). `minHeight={0}` evita che il minimo di
    // contenuto predefinito di un flex item (`min-height:auto`) blocchi
    // comunque la riduzione, stesso principio già applicato all'area
    // scrollabile dei messaggi qui sotto (`minHeight: 0` nello style
    // inline).
    <YStack width="100%" flex={1} minHeight={0} backgroundColor={brand.calce} overflow="hidden">
      <XStack justifyContent="space-between" alignItems="center" flexShrink={0} paddingHorizontal="$5" paddingTop="$5" paddingBottom="$3">
        <XStack alignItems="center" gap="$3" flex={1} minWidth={0}>
          {onBack && backIcon === "chevron-left" ? (
            <XStack
              width={32}
              height={32}
              alignItems="center"
              justifyContent="center"
              cursor="pointer"
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Torna all'elenco delle chat"
              flexShrink={0}
            >
              <Icon name="chevron-left" size={22} color={brand.grafite} />
            </XStack>
          ) : null}
          {/* Nome+foto dell'altra parte in intestazione quando disponibili
              (richiesta implicita dal nuovo pannello inline di /chat: nel
              layout a due colonne l'elenco a sinistra non resta sempre
              visibile su mobile mentre la conversazione è aperta, serve
              sapere "con chi" anche qui) — ricade sul titolo generico
              altrove (i 5 punti di montaggio esistenti come popup, dove
              questo comportamento è invariato rispetto a prima). */}
          {otherPartyName ? (
            <>
              <Avatar name={otherPartyName} imageUrl={otherPartyImageUrl} size={36} />
              <YStack minWidth={0} flex={1}>
                <Text fontFamily="$heading" fontWeight="800" fontSize="$5" color={brand.grafite} numberOfLines={1}>
                  {otherPartyName}
                </Text>
                <Text fontSize="$1" color={brand.grafite70}>
                  Cronologia della richiesta
                </Text>
              </YStack>
            </>
          ) : (
            <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite} numberOfLines={1}>
              {title}
            </Text>
          )}
        </XStack>
        {onBack && backIcon === "x" ? (
          <Text fontSize="$5" color={brand.grafite70} cursor="pointer" onPress={onBack} accessibilityRole="button" accessibilityLabel="Chiudi">
            ✕
          </Text>
        ) : null}
      </XStack>

      {/* Unica regione scorrevole del pannello — intestazione e modulo di
          invio restano sempre visibili sopra/sotto, come in una chat vera,
          invece di scorrere via insieme ai messaggi su una cronologia
          lunga. */}
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
                        {event.mediaUrls.map((url) =>
                          // Un documento (PDF/Word/Excel) deve mostrare già
                          // il proprio nome in chat, non solo un'icona
                          // generica "PDF" — richiesta esplicita
                          // dell'utente ("deve essere già visibile il nome
                          // del file in chat"): chip icona+nome invece
                          // della tessera quadrata riservata a foto/video.
                          isDocumentUrl(url) ? (
                            <XStack
                              key={url}
                              alignItems="center"
                              gap="$1.5"
                              maxWidth={200}
                              paddingHorizontal="$2"
                              paddingVertical="$1.5"
                              borderRadius="$2"
                              borderWidth={1}
                              borderColor={brand.filetto}
                              backgroundColor={brand.calce}
                              cursor="pointer"
                              onPress={() => openMediaAt(event.mediaUrls, url)}
                              accessibilityRole="button"
                            >
                              <Icon name="file-text" size={14} color={brand.cianografia} />
                              <Text fontSize={11} color={brand.grafite} numberOfLines={1} flexShrink={1}>
                                {attachmentFileName(url) ?? `Documento.${documentTypeLabel(url).toLowerCase()}`}
                              </Text>
                            </XStack>
                          ) : (
                            <MediaPreview
                              key={url}
                              url={url}
                              onClick={() => openMediaAt(event.mediaUrls, url)}
                              style={{ width: 64, height: 64, borderRadius: 4, cursor: "pointer", border: `1px solid ${brand.filetto}` }}
                            />
                          ),
                        )}
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
          {mediaUrls.map((url) =>
            // Un documento non ancora inviato mostra già il proprio nome
            // reale (richiesta esplicita dell'utente, stesso principio
            // applicato sopra ai messaggi già inviati) — chip icona+nome
            // con un tasto "x" in coda invece della tessera quadrata con
            // l'overlay circolare usato per foto/video.
            isDocumentUrl(url) ? (
              <XStack
                key={url}
                alignItems="center"
                gap="$1.5"
                maxWidth={220}
                paddingHorizontal="$2"
                paddingVertical="$1.5"
                borderRadius="$2"
                borderWidth={1}
                borderColor={brand.filetto}
                backgroundColor={brand.gesso}
                cursor="pointer"
                onPress={() => openMediaAt(mediaUrls, url)}
                accessibilityRole="button"
              >
                <Icon name="file-text" size={14} color={brand.cianografia} />
                <Text fontSize={11} color={brand.grafite} numberOfLines={1} flexShrink={1}>
                  {attachmentFileName(url) ?? `Documento.${documentTypeLabel(url).toLowerCase()}`}
                </Text>
                <YStack
                  width={16}
                  height={16}
                  borderRadius={8}
                  alignItems="center"
                  justifyContent="center"
                  cursor="pointer"
                  onPress={(e) => {
                    e.stopPropagation();
                    removeMedia(url);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Rimuovi allegato"
                >
                  <Icon name="x" size={11} color={brand.grafite70} strokeWidth={2} />
                </YStack>
              </XStack>
            ) : (
              <YStack key={url} width={56} height={56} borderRadius="$2" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
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
            ),
          )}
          {mediaUrls.length < MAX_UPDATE_MEDIA ? (
            // Graffetta + menu (richiesta esplicita dell'utente: "al posto
            // del file più, metti il simbolo di una graffetta per
            // allegare, e fai selezionare: fotocamera, foto/video, File.
            // in modo che puo essere caricata anche la fattura o
            // ricevuta") — sostituisce il vecchio tasto "+" con un unico
            // input nascosto. Menu aperto verso l'alto (`bottom="100%"`):
            // il tasto vive in fondo al pannello, un menu verso il basso
            // rischierebbe di finire tagliato dal bordo.
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
                {isUploadingMedia ? <UploadingDots dotSize={5} /> : <Icon name="paperclip" size={20} color={brand.grafite70} />}
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

      {openPhoto ? <PhotoLightbox photos={openPhoto.photos} initialIndex={openPhoto.index} onClose={() => setOpenPhoto(null)} /> : null}

      {cameraStream ? (
        // Cattura webcam da computer, stesso pattern overlay DOM grezzo già
        // in uso altrove nel prodotto (`role="dialog"`, chiusura su
        // Escape/click sul backdrop) — sopra a questo pannello (z-index
        // maggiore), unico modo di restare visibile sopra un contenuto già
        // aperto (popup o pannello inline).
        <div
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            // Sempre `stopPropagation`: in modalità popup (TimelineModal)
            // questo overlay vive annidato dentro il backdrop del popup
            // stesso, che chiude su qualunque click che gli arrivi — senza
            // fermare la bolla qui, cliccare "Scatta foto"/"Annulla"
            // richiuderebbe anche il popup sottostante per intero (bug
            // reale già riprodotto e corretto in passato).
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
    </YStack>
  );
}
