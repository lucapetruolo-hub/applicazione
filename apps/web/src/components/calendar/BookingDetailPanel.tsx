"use client";

import { useEffect, useRef, useState } from "react";
import { buildWhatsAppLink, formatBookingAddress, formatServicePriceRange, type ProfessionalBooking } from "@professionisti/shared";
import { Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { MediaPreview } from "@/components/MediaPreview";

const STATUS_LABEL: Record<ProfessionalBooking["status"], string> = {
  PENDING: "In attesa di conferma",
  CONFIRMED: "Confermata",
  COMPLETED: "Completata",
  CANCELED: "Annullata",
  NO_SHOW: "Cliente non presentato",
};

const STATUS_COLOR: Record<ProfessionalBooking["status"], string> = {
  PENDING: brand.ottone,
  CONFIRMED: brand.verificato,
  COMPLETED: brand.grafite70,
  CANCELED: brand.urgenza,
  NO_SHOW: brand.urgenza,
};

/**
 * Pannello di dettaglio aperto cliccando un evento nel calendario
 * "Prenotazioni" (/dashboard/agenda): overlay DOM grezzo, stesso pattern di
 * PhotoLightbox (role="dialog", chiusura con Escape/click sul backdrop,
 * nessuna libreria aggiunta).
 */
export function BookingDetailPanel({
  booking,
  onClose,
  onAction,
  isActionPending,
  onSaveNote,
  isSavingNote,
  onSaveMeetingLink,
  isSavingMeetingLink,
  onOpenTimeline,
  onOpenFullRequest,
}: {
  booking: ProfessionalBooking;
  onClose: () => void;
  onAction: (status: "CONFIRMED" | "COMPLETED" | "CANCELED") => void;
  isActionPending: boolean;
  /** Nota privata del professionista (mai vista dal cliente) — richiesta esplicita dell'utente. */
  onSaveNote: (note: string) => void;
  isSavingNote: boolean;
  /** Link della consulenza video (Meet/Zoom/ecc.), visibile al cliente — richiesta esplicita dell'utente. */
  onSaveMeetingLink: (meetingLink: string) => void;
  isSavingMeetingLink: boolean;
  /** Apre la cronologia completa della richiesta (richiesta esplicita dell'utente) — assente per prenotazioni senza GuidedRequest collegata (bookAgendaSlot). */
  onOpenTimeline?: () => void;
  /**
   * Porta alla pipeline completa della richiesta su /dashboard/richieste
   * (richiesta esplicita dell'utente: "dai la possibilità tramite pulsante
   * di portarlo sulla richiesta completa") — distinto da `onOpenTimeline`
   * (quello apre solo la chat): qui si vedono voci del preventivo, stato
   * della trattativa e le altre azioni già disponibili su quella pagina.
   * Assente per le stesse prenotazioni senza GuidedRequest collegata.
   */
  onOpenFullRequest?: () => void;
}) {
  // `key={booking.id}` sul punto di montaggio (agenda/page.tsx) garantisce
  // uno stato fresco ad ogni apertura di una prenotazione diversa, stesso
  // pattern già in uso per SlotEditorModal.
  const [noteDraft, setNoteDraft] = useState(booking.professionalNote ?? "");
  const [meetingLinkDraft, setMeetingLinkDraft] = useState(booking.meetingLink ?? "");
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  const noteChanged = noteDraft !== (booking.professionalNote ?? "");
  const meetingLinkChanged = meetingLinkDraft !== (booking.meetingLink ?? "");
  // Stesso auto-grow di dashboard/richieste/page.tsx: il CSS
  // resize:vertical non è trascinabile su mobile (nessun browser touch
  // lo supporta), la textarea restava bloccata all'altezza iniziale —
  // corretta con un'altezza calcolata via JS ad ogni cambio testo,
  // identica su desktop e mobile.
  const noteTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = noteTextareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [noteDraft]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Bug reale corretto: PhotoLightbox ha il proprio handler Escape
      // sullo stesso `document` — senza questa guardia, un solo Escape
      // chiudeva contemporaneamente sia la foto a schermo intero sia
      // questo pannello sottostante, invece di tornare al pannello.
      if (e.key === "Escape" && openPhotoIndex === null) onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, openPhotoIndex]);

  const date = new Date(booking.scheduledAt);
  const endDate = booking.scheduledEndAt ? new Date(booking.scheduledEndAt) : null;
  // Indirizzo strutturato (raccolto all'accettazione preventivo) ha
  // priorità su quello libero, quando presente — vedi formatBookingAddress.
  const structuredAddress = formatBookingAddress(booking);
  const recipientFullName = [booking.recipientName, booking.recipientSurname].filter(Boolean).join(" ") || null;
  const recipientPhone = booking.recipientPhone ?? booking.clientPhone;
  const whatsAppLink = buildWhatsAppLink(recipientPhone);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Dettaglio prenotazione"
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
        maxWidth={420}
        backgroundColor={brand.calce}
        borderRadius="$3"
        borderWidth={1}
        borderColor={brand.filetto}
        padding="$5"
        gap="$4"
      >
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2">
          <YStack gap="$1">
            <Text fontFamily="$heading" fontWeight="800" fontSize="$6" color={brand.grafite}>
              {recipientFullName ?? booking.clientName ?? "Cliente"}
            </Text>
            <Text fontFamily="$body" fontSize={11} fontWeight="700" color={STATUS_COLOR[booking.status]}>
              {STATUS_LABEL[booking.status]}
            </Text>
          </YStack>
          <Text fontSize="$5" color={brand.grafite70} cursor="pointer" onPress={onClose} accessibilityRole="button" accessibilityLabel="Chiudi">
            ✕
          </Text>
        </XStack>

        <YStack gap="$1">
          <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
            Data e ora
          </Text>
          <Text color={brand.grafite} fontSize="$4">
            {date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · "}
            {date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}
            {/* Fascia completa (richiesta esplicita dell'utente: "non
                visualizzare solo il primo orario ma tutta la fascia
                d'orario"), quando l'ora di fine è nota. */}
            {endDate ? `–${endDate.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}` : ""}
          </Text>
          {/* Tipo di intervento (a domicilio/online), richiesta esplicita
              dell'utente: stesso trattamento già visibile in "Richieste
              ricevute" (RequestCard/ServiceBadge, /dashboard/richieste) —
              assente per le prenotazioni precedenti a questa funzionalità
              (GuidedRequest.serviceMode nullable) o dirette da agenda
              pubblica senza GuidedRequest collegata. */}
          {booking.serviceMode ? (
            <XStack alignItems="center" gap={6} marginTop={2}>
              <Icon name={booking.serviceMode === "ONLINE" ? "video" : "house"} size={14} color={brand.cianografia} strokeWidth={1.5} />
              <Text fontFamily="$body" fontSize="$3" fontWeight="600" color={brand.grafite}>
                {booking.serviceMode === "ONLINE" ? "Consulenza online" : "A domicilio"}
              </Text>
            </XStack>
          ) : null}
        </YStack>

        {/* Dati del cliente utili al professionista per andare a svolgere il
            lavoro (richiesta esplicita dell'utente): telefono/email come
            link diretti tel:/mailto:, indirizzo preciso se indicato nella
            richiesta guidata collegata (assente per le prenotazioni dirette
            da agenda, che non hanno una GuidedRequest). */}
        {recipientPhone || booking.clientEmail || structuredAddress || booking.address ? (
          <YStack gap="$2">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              Contatti cliente
            </Text>
            <YStack gap="$1.5">
              {recipientPhone ? (
                <XStack alignItems="center" gap="$3" flexWrap="wrap">
                  <a href={`tel:${recipientPhone}`} style={{ textDecoration: "none" }}>
                    <XStack alignItems="center" gap="$2">
                      <Icon name="phone" size={14} color={brand.cianografia} strokeWidth={1.5} />
                      <Text color={brand.cianografia} fontSize="$3" fontWeight="600">
                        {recipientPhone}
                      </Text>
                    </XStack>
                  </a>
                  {whatsAppLink ? (
                    <a href={whatsAppLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>
                      <XStack alignItems="center" gap="$1.5">
                        <Icon name="message-circle" size={14} color={brand.verificato} strokeWidth={1.5} />
                        <Text color={brand.verificato} fontSize="$3" fontWeight="600">
                          WhatsApp
                        </Text>
                      </XStack>
                    </a>
                  ) : null}
                </XStack>
              ) : null}
              {booking.clientEmail ? (
                <a href={`mailto:${booking.clientEmail}`} style={{ textDecoration: "none" }}>
                  <XStack alignItems="center" gap="$2">
                    <Icon name="mail" size={14} color={brand.cianografia} strokeWidth={1.5} />
                    <Text color={brand.cianografia} fontSize="$3" fontWeight="600">
                      {booking.clientEmail}
                    </Text>
                  </XStack>
                </a>
              ) : null}
              {structuredAddress ?? booking.address ? (
                <XStack alignItems="center" gap="$2">
                  <Icon name="map-pin" size={14} color={brand.grafite70} strokeWidth={1.5} />
                  <Text color={brand.grafite} fontSize="$3">
                    {structuredAddress ?? booking.address}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
          </YStack>
        ) : null}

        {booking.items.length > 0 ? (
          <YStack gap="$2">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              Preventivo
            </Text>
            <YStack gap="$1">
              {booking.items.map((item) => (
                <XStack key={item.id} justifyContent="space-between" gap="$2">
                  <Text color={brand.grafite} fontSize="$3">
                    {item.name}
                  </Text>
                  <Text color={brand.grafite70} fontSize="$3">
                    {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
                  </Text>
                </XStack>
              ))}
            </YStack>
          </YStack>
        ) : null}

        {/* Descrizione del lavoro e foto scritte/caricate dal cliente nella
            richiesta guidata originale (richiesta esplicita dell'utente) —
            assenti per le prenotazioni dirette da agenda pubblica, che non
            hanno una GuidedRequest collegata. `?? []` difensivo: web e API
            si deployano indipendentemente. */}
        {booking.description ? (
          <YStack gap="$1">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              Descrizione del lavoro
            </Text>
            <Text color={brand.grafite} fontSize="$3">
              {booking.description}
            </Text>
          </YStack>
        ) : null}

        {(booking.photoUrls ?? []).length > 0 ? (
          <YStack gap="$2">
            <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
              Foto del cliente
            </Text>
            <XStack gap="$2" flexWrap="wrap">
              {booking.photoUrls.map((url, index) => (
                <MediaPreview
                  key={url}
                  url={url}
                  onClick={() => setOpenPhotoIndex(index)}
                  style={{ width: 64, height: 64, borderRadius: 4, cursor: "pointer", border: `1px solid ${brand.filetto}` }}
                />
              ))}
            </XStack>
          </YStack>
        ) : null}

        {/* Link consulenza video (Meet/Zoom/ecc.), richiesta esplicita
            dell'utente — a differenza della nota sotto, questo È visibile al
            cliente (in /le-mie-richieste). */}
        <YStack gap="$2">
          <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
            Link videochiamata (visibile al cliente)
          </Text>
          <XStack alignItems="center" gap="$2">
            <Icon name="video" size={14} color={brand.grafite70} strokeWidth={1.5} />
            <input
              value={meetingLinkDraft}
              onChange={(e) => setMeetingLinkDraft(e.target.value)}
              placeholder="https://meet.google.com/..."
              style={{
                flex: 1,
                padding: 10,
                borderRadius: 4,
                border: `1px solid ${brand.filetto}`,
                fontSize: 14,
                fontFamily: "inherit",
                color: brand.grafite,
              }}
            />
          </XStack>
          {meetingLinkChanged ? (
            <Button
              variant="secondary"
              size="$3"
              height={36}
              alignSelf="flex-start"
              disabled={isSavingMeetingLink}
              opacity={isSavingMeetingLink ? 0.6 : 1}
              onPress={() => onSaveMeetingLink(meetingLinkDraft)}
            >
              {isSavingMeetingLink ? "Salvataggio..." : "Salva link"}
            </Button>
          ) : null}
        </YStack>

        {/* Nota privata del professionista (richiesta esplicita dell'utente:
            "eventuali note da ricordare") — mai vista dal cliente, a
            differenza della nota di annullamento (CancelBookingModal). */}
        <YStack gap="$2">
          <Text fontFamily="$body" fontWeight="700" fontSize={11} color={brand.grafite70}>
            Note personali (solo per te)
          </Text>
          <textarea
            ref={noteTextareaRef}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Es. portare il pezzo di ricambio, citofono guasto..."
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
              resize: "none",
              overflow: "hidden",
            }}
          />
          {noteChanged ? (
            <Button
              variant="secondary"
              size="$3"
              height={36}
              alignSelf="flex-start"
              disabled={isSavingNote}
              opacity={isSavingNote ? 0.6 : 1}
              onPress={() => onSaveNote(noteDraft)}
            >
              {isSavingNote ? "Salvataggio..." : "Salva nota"}
            </Button>
          ) : null}
        </YStack>

        <XStack gap="$2" flexWrap="wrap">
          {booking.status === "PENDING" ? (
            <Button variant="secondary" size="$3" height={40} disabled={isActionPending} opacity={isActionPending ? 0.6 : 1} onPress={() => onAction("CONFIRMED")}>
              Conferma
            </Button>
          ) : null}
          {booking.status === "CONFIRMED" ? (
            <Button variant="secondary" size="$3" height={40} disabled={isActionPending} opacity={isActionPending ? 0.6 : 1} onPress={() => onAction("COMPLETED")}>
              Segna come completata
            </Button>
          ) : null}
          {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
            <Button variant="ghost" size="$3" height={40} disabled={isActionPending} opacity={isActionPending ? 0.6 : 1} onPress={() => onAction("CANCELED")}>
              Annulla
            </Button>
          ) : null}
        </XStack>

        {/* Richiesta esplicita dell'utente: resi come veri pulsanti (non più
            "ghost"/testo sottolineato) e spostati in fondo alla scheda,
            insieme alle altre azioni — prima stavano subito sotto data/ora,
            in cima. */}
        {onOpenTimeline || onOpenFullRequest ? (
          <XStack gap="$2" flexWrap="wrap">
            {onOpenTimeline ? (
              <Button variant="secondary" size="$3" height={40} onPress={onOpenTimeline}>
                <XStack alignItems="center" gap={4}>
                  <Icon name="message-circle" size={15} color={brand.cianografia} strokeWidth={2} />
                  <Text color={brand.cianografia} fontWeight="700" fontSize="$3">
                    Contatta/Cronologia
                  </Text>
                </XStack>
              </Button>
            ) : null}
            {onOpenFullRequest ? (
              <Button variant="secondary" size="$3" height={40} onPress={onOpenFullRequest}>
                <XStack alignItems="center" gap={4}>
                  <Text color={brand.grafite} fontWeight="700" fontSize="$3">
                    Vai alla richiesta completa
                  </Text>
                  <Icon name="chevron-right" size={15} color={brand.grafite} strokeWidth={2} />
                </XStack>
              </Button>
            ) : null}
          </XStack>
        ) : null}
      </YStack>

      {openPhotoIndex !== null ? (
        <PhotoLightbox photos={booking.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} />
      ) : null}
    </div>
  );
}
