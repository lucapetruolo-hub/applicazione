"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { ConversationEvent } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { MediaPreview } from "@/components/MediaPreview";
import { PhotoLightbox } from "@/components/PhotoLightbox";

const MAX_UPDATE_MEDIA = 5;

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
  onClose: () => void;
}) {
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
  const mediaInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiClient
      .guidedRequestTimeline(token, guidedRequestId, professionalProfileId)
      .then(setEvents)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Errore nel caricamento della cronologia."));
  }, [token, guidedRequestId, professionalProfileId]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !openPhoto) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, openPhoto]);

  async function handleMediaChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setMediaError(null);
    setIsUploadingMedia(true);
    try {
      const result = await apiClient.uploadTimelinePhoto(token, file);
      setMediaUrls((prev) => [...prev, result.imageUrl].slice(0, MAX_UPDATE_MEDIA));
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : "Errore durante il caricamento della foto.");
    } finally {
      setIsUploadingMedia(false);
    }
  }

  function removeMedia(url: string) {
    setMediaUrls((prev) => prev.filter((u) => u !== url));
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
        // `alignItems: "center"` su un contenitore flex con `overflow-y:
        // auto` è un bug noto (soprattutto iOS Safari): quando il
        // contenuto è più alto del viewport, la parte superiore
        // dell'elemento overflow non è raggiungibile scorrendo — segnalato
        // dall'utente come "non si naviga bene su e giù" con una
        // cronologia lunga. `flex-start` con lo stesso padding verticale
        // rende il popup ancorato in alto invece che centrato quando
        // supera l'altezza dello schermo, ma resta sempre scorrevole per
        // intero in ogni browser.
        alignItems: "flex-start",
        justifyContent: "center",
        zIndex: 1000,
        padding: 16,
        overflowY: "auto",
      }}
    >
      <YStack
        onPress={(e: { stopPropagation: () => void }) => e.stopPropagation()}
        width="100%"
        maxWidth={520}
        backgroundColor={brand.calce}
        borderRadius="$3"
        padding="$5"
        gap="$4"
      >
        <XStack justifyContent="space-between" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
            Cronologia della richiesta
          </Text>
          <Text fontSize="$5" color={brand.grafite70} cursor="pointer" onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi">
            ✕
          </Text>
        </XStack>

        <YStack gap="$3">
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
                    <Text fontFamily="$body" fontWeight="700" fontSize={11} color={ACTOR_COLOR[event.actor]}>
                      {displayNameFor(event.actor)}
                    </Text>
                    {event.message ? (
                      <Text color={brand.grafite} fontSize="$3">
                        {event.message}
                      </Text>
                    ) : null}
                    {event.mediaUrls.length > 0 ? (
                      <XStack gap="$2" flexWrap="wrap">
                        {event.mediaUrls.map((url, index) => (
                          <MediaPreview
                            key={url}
                            url={url}
                            onClick={() => setOpenPhoto({ photos: event.mediaUrls, index })}
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
        </YStack>

        <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
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
                <MediaPreview url={url} />
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
                onPress={() => !isUploadingMedia && mediaInputRef.current?.click()}
                accessibilityRole="button"
                accessibilityLabel="Aggiungi foto o video"
              >
                <Text fontSize="$6" color={brand.grafite70}>
                  {isUploadingMedia ? "…" : "+"}
                </Text>
              </YStack>
            ) : null}
          </XStack>
          <input ref={mediaInputRef} type="file" accept="image/*,video/*" onChange={handleMediaChange} disabled={isUploadingMedia} style={{ display: "none" }} />
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
    </div>
  );
}
