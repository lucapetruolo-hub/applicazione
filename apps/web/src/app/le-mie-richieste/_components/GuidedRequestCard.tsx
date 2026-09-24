"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { ClientBooking, ClientGuidedRequest } from "@professionisti/api-client";
import { ALL_ITALIAN_CITY_NAMES, averageQuoteTotalEurCents, findComuneByName, formatEurCents, type GuidedRequestStatusSummary } from "@professionisti/shared";
import { Autocomplete, Badge, Button, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { MediaPreview } from "@/components/MediaPreview";
import { UploadingDots } from "@/components/UploadingDots";
import { AddressAutocompleteInput } from "@/components/AddressAutocompleteInput";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { TimelineModal } from "@/components/TimelineModal";
import { CardActionsMenu, type CardAction } from "@/components/CardActionsMenu";
import { buildPersonalStateActions, RequestStateIndicators } from "@/components/RequestCardPersonalActions";
import { combineUnreadCounts } from "@/lib/notificationSections";
import { UnreadDot } from "@/components/UnreadDot";
import { clientNextAction } from "@/lib/clientNextAction";
import { CLIENT_STAGE_LABEL, type RequestStage } from "@/lib/requestStage";
import { BookingSection } from "./BookingSection";
import { QuoteCard } from "./QuoteCard";
import { ClientMiniTimeline, ClientStagePill, MAX_REQUEST_PHOTOS, STAGE_STYLE, ServiceBadge, formatDateTime, textareaStyle } from "./clientRequestHelpers";

export function GuidedRequestCard({
  request,
  booking,
  stage,
  token,
  onChanged,
  onAcceptQuote,
  isOpen,
  onToggle,
  isNew,
  newQuoteIds,
  threadUnreadCounts,
  quoteUnreadCounts,
  bookingUnreadCounts,
  autoOpenChatProfessionalId,
  onChatAutoOpenHandled,
  onMarkedRead,
}: {
  request: ClientGuidedRequest;
  /** Prenotazione nata dal preventivo accettato di questa richiesta, se esiste. */
  booking: ClientBooking | null;
  stage: RequestStage;
  token: string;
  onChanged: () => void;
  onAcceptQuote: (quoteId: string) => Promise<void>;
  isOpen: boolean;
  onToggle: () => void;
  /** True se questa richiesta (o la sua prenotazione) ha un aggiornamento non letto. */
  isNew?: boolean;
  /** ID dei preventivi con un aggiornamento non letto — disambigua QUALE preventivo tra più ricevuti per questa richiesta. */
  newQuoteIds?: Set<string>;
  /** Conteggio aggiornamenti non letti per thread (chiave `guidedRequestId:professionalProfileId`) — pallino su "Contatta/Cronologia" nella sezione "Inviata a", prima che esista un preventivo. */
  threadUnreadCounts?: Map<string, number>;
  /** Conteggio aggiornamenti non letti per singolo preventivo. */
  quoteUnreadCounts?: Map<string, number>;
  /** Conteggio aggiornamenti non letti per la prenotazione. */
  bookingUnreadCounts?: Map<string, number>;
  /** Professionista del cui thread arriva un nuovo messaggio in chat — apre subito il TimelineModal giusto. */
  autoOpenChatProfessionalId?: string | null;
  /** Richiamata subito dopo aver gestito `autoOpenChatProfessionalId` — il genitore azzera il proprio stato "in sospeso" così un eventuale rimontaggio successivo non la riapre da sola. */
  onChatAutoOpenHandled?: () => void;
  /** "Segna come letta" dal menu: spegne subito il "Nuovo" locale del genitore. */
  onMarkedRead: () => void;
}) {
  const isOnline = request.serviceMode === "ONLINE";
  const router = useRouter();

  // Professionista il cui thread è aperto nella cronologia (sezione "Inviata
  // a", prima che esista un preventivo).
  const [openTimelineProfessionalId, setOpenTimelineProfessionalId] = useState<string | null>(null);
  const [dismissedThreadCounts, setDismissedThreadCounts] = useState<Map<string, number>>(new Map());
  function effectiveThreadUnread(key: string): number | undefined {
    const count = threadUnreadCounts?.get(key);
    if (count === undefined) return undefined;
    return Math.max(0, count - (dismissedThreadCounts.get(key) ?? 0));
  }
  function openTimelineForProfessional(professionalId: string) {
    setOpenTimelineProfessionalId(professionalId);
    const key = `${request.id}:${professionalId}`;
    setDismissedThreadCounts((prev) => new Map(prev).set(key, threadUnreadCounts?.get(key) ?? 0));
  }
  const autoOpenedChatRef = useRef<string | null>(null);
  useEffect(() => {
    if (!autoOpenChatProfessionalId) return;
    if (autoOpenedChatRef.current === autoOpenChatProfessionalId) return;
    autoOpenedChatRef.current = autoOpenChatProfessionalId;
    const hasQuote = request.quotes.some((q) => q.professionalProfileId === autoOpenChatProfessionalId);
    if (!hasQuote) openTimelineForProfessional(autoOpenChatProfessionalId);
    onChatAutoOpenHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenChatProfessionalId]);

  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(request.description);
  const [city, setCity] = useState(request.city);
  const [address, setAddress] = useState(request.address ?? "");
  const [recipientName, setRecipientName] = useState(request.recipientName ?? "");
  const [recipientSurname, setRecipientSurname] = useState(request.recipientSurname ?? "");
  const [recipientPhone, setRecipientPhone] = useState(request.recipientPhone ?? "");
  const [houseNumber, setHouseNumber] = useState(request.houseNumber ?? "");
  const [addressExtra, setAddressExtra] = useState(request.addressExtra ?? "");
  const [postalCode, setPostalCode] = useState(request.postalCode ?? "");
  const [province, setProvince] = useState(request.province ?? "");
  const [photoUrls, setPhotoUrls] = useState<string[]>(request.photoUrls);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  // "Annulla prenotazione" (una volta accettato un preventivo) apre un
  // modale a sé, CancelBookingModal — stato tenuto qui perché il pulsante
  // che lo apre vive nell'intestazione (unificata con quella della
  // richiesta), non dentro BookingSection.
  const [showCancelModal, setShowCancelModal] = useState(false);
  // Conferma breve dopo "Copia riepilogo" (nessun toast globale per azioni locali).
  const [notice, setNotice] = useState<string | null>(null);
  function flashNotice(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 3000);
  }

  const [statusSummary, setStatusSummary] = useState<GuidedRequestStatusSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    apiClient
      .guidedRequestStatus(token, request.id)
      .then((summary) => {
        if (!cancelled) setStatusSummary(summary);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, request.id]);

  // Una richiesta CLOSED ha già portato a una prenotazione (o è stata
  // annullata/è scaduta): non ha senso modificarla o eliminarla a quel
  // punto (stesso confine applicato lato API).
  const canDelete = request.status !== "CLOSED";
  const hasQuote = request.quotes.length > 0;
  const canEditDetails = canDelete && !hasQuote;
  const averagePriceEurCents = useMemo(() => averageQuoteTotalEurCents(request.quotes.map((quote) => quote.items)), [request.quotes]);

  function startEditing() {
    setDescription(request.description);
    setCity(request.city);
    setAddress(request.address ?? "");
    setRecipientName(request.recipientName ?? "");
    setRecipientSurname(request.recipientSurname ?? "");
    setRecipientPhone(request.recipientPhone ?? "");
    setHouseNumber(request.houseNumber ?? "");
    setAddressExtra(request.addressExtra ?? "");
    setPostalCode(request.postalCode ?? "");
    setProvince(request.province ?? "");
    setPhotoUrls(request.photoUrls);
    setPhotoError(null);
    setError(null);
    setIsEditing(true);
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setIsUploadingPhoto(true);
    try {
      const result = await apiClient.uploadGuidedRequestPhoto(token, file);
      setPhotoUrls((prev) => [...prev, result.imageUrl].slice(0, MAX_REQUEST_PHOTOS));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Errore durante il caricamento della foto.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  async function handleSaveEdit() {
    setError(null);
    if (description.trim().length < 10) {
      setError("Descrivi il lavoro con almeno 10 caratteri.");
      return;
    }
    if (request.serviceMode !== "ONLINE" && !city.trim()) {
      setError("Indica la città.");
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.updateGuidedRequest(token, request.id, {
        description: description.trim(),
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        recipientName: recipientName.trim() || undefined,
        recipientSurname: recipientSurname.trim() || undefined,
        recipientPhone: recipientPhone.trim() || undefined,
        houseNumber: houseNumber.trim() || undefined,
        addressExtra: addressExtra.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        province: province.trim() || undefined,
        photoUrls,
      });
      setIsEditing(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    setError(null);
    try {
      await apiClient.deleteGuidedRequest(token, request.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    }
  }

  async function handlePermanentDelete() {
    setError(null);
    try {
      await apiClient.deleteGuidedRequestPermanently(token, request.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    }
  }

  // Riepilogo condivisibile — solo categoria, zona, descrizione e stato:
  // mai indirizzo, telefono o nome del destinatario (chi lo riceve non è
  // detto sia la persona giusta per vederli).
  async function handleShare() {
    const lines = [
      `Richiesta di preventivo: ${request.categoryLabel}${request.city ? ` a ${request.city}` : isOnline ? " (consulenza online)" : ""}`,
      request.description,
      `Stato: ${CLIENT_STAGE_LABEL[stage]}`,
      `Inviata il ${formatDateTime(request.createdAt)}`,
    ];
    const text = lines.join("\n");
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({ title: `Richiesta ${request.categoryLabel}`, text });
        return;
      }
      await navigator.clipboard.writeText(text);
      flashNotice("Riepilogo copiato negli appunti.");
    } catch (err) {
      // L'utente che chiude il pannello di condivisione non è un errore.
      if (err instanceof Error && err.name === "AbortError") return;
      setError("Impossibile condividere o copiare il riepilogo da questo browser.");
    }
  }

  async function handleReopenBooking() {
    if (!booking) return;
    setError(null);
    try {
      await apiClient.reopenBooking(token, booking.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    }
  }

  async function handleCancelBooking(): Promise<void> {
    if (!booking) return;
    await apiClient.cancelMyBooking(token, booking.id);
    setShowCancelModal(false);
    onChanged();
  }

  if (isEditing) {
    return (
      <Surface gap="$3">
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
            {request.categoryLabel}
          </Text>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={textareaStyle} />
          <YStack borderWidth={1} borderColor={brand.filetto} borderRadius="$4" backgroundColor={brand.calce}>
            <Autocomplete items={ALL_ITALIAN_CITY_NAMES} getKey={(item) => item} getLabel={(item) => item} onSelect={setCity} value={city} onChangeText={setCity} placeholder="Città" minChars={3} />
          </YStack>
          {request.serviceMode === "ONLINE" ? (
            <Text fontSize="$2" color={brand.grafite70}>
              Per una consulenza online non è obbligatorio indicare la città.
            </Text>
          ) : null}
          <AddressAutocompleteInput
            value={address}
            onChange={setAddress}
            onSelect={(selected) => {
              // Suggerimenti di Google: compila anche gli altri campi (docs/CHANGELOG.md §141).
              if (selected.street) setAddress(selected.street);
              if (selected.houseNumber) setHouseNumber(selected.houseNumber);
              if (selected.postalCode) setPostalCode(selected.postalCode);
              if (selected.province) setProvince(selected.province);
              const comune = selected.locality ? findComuneByName(selected.locality) : undefined;
              if (comune) setCity(comune.name);
            }}
            biasTowards={(() => {
              const comune = findComuneByName(city);
              return comune ? { latitude: comune.lat, longitude: comune.lon } : null;
            })()}
            placeholder="Via/piazza"
            style={textareaStyle}
          />

          <XStack gap="$2" flexWrap="wrap">
            <YStack flex={1} minWidth={160}>
              <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Nome" style={textareaStyle} />
            </YStack>
            <YStack flex={1} minWidth={160}>
              <input value={recipientSurname} onChange={(e) => setRecipientSurname(e.target.value)} placeholder="Cognome" style={textareaStyle} />
            </YStack>
          </XStack>
          <input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="Numero di telefono" style={textareaStyle} />
          <XStack gap="$2" flexWrap="wrap">
            <YStack flex={1} minWidth={120}>
              <input value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="Numero civico" style={textareaStyle} />
            </YStack>
            <YStack flex={1} minWidth={120}>
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="CAP" style={textareaStyle} />
            </YStack>
            <YStack flex={1} minWidth={120}>
              <input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Provincia" style={textareaStyle} />
            </YStack>
          </XStack>
          <input value={addressExtra} onChange={(e) => setAddressExtra(e.target.value)} placeholder="Scala, piano, interno (facoltativo)" style={textareaStyle} />

          <YStack gap="$1">
            <Text fontSize="$2" color={brand.grafite70}>
              Foto o video (opzionale, fino a {MAX_REQUEST_PHOTOS})
            </Text>
            <YStack flexDirection="row" flexWrap="wrap" gap="$2">
              {photoUrls.map((url) => (
                <YStack key={url} width={72} height={72} borderRadius="$3" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
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
                    onPress={() => removePhoto(url)}
                    accessibilityRole="button"
                    accessibilityLabel="Rimuovi foto"
                  >
                    <X size={11} strokeWidth={2} color="white" />
                  </YStack>
                </YStack>
              ))}
              {photoUrls.length < MAX_REQUEST_PHOTOS ? (
                <YStack
                  width={72}
                  height={72}
                  borderRadius="$3"
                  borderWidth={1}
                  borderColor={brand.filetto}
                  borderStyle="dashed"
                  alignItems="center"
                  justifyContent="center"
                  cursor="pointer"
                  opacity={isUploadingPhoto ? 0.6 : 1}
                  onPress={() => !isUploadingPhoto && photoInputRef.current?.click()}
                  accessibilityRole="button"
                  accessibilityLabel="Aggiungi foto"
                >
                  {isUploadingPhoto ? (
                    <UploadingDots dotSize={6} />
                  ) : (
                    <Text fontSize="$6" color={brand.grafite70}>
                      +
                    </Text>
                  )}
                </YStack>
              ) : null}
            </YStack>
            <input ref={photoInputRef} type="file" accept="image/*,video/*" onChange={handlePhotoChange} disabled={isUploadingPhoto} style={{ display: "none" }} />
            {photoError ? (
              <Text color={brand.urgenza} fontSize="$2">
                {photoError}
              </Text>
            ) : null}
          </YStack>

          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}
          <XStack gap="$2">
            <Button variant="primary" size="$3" height={40} onPress={handleSaveEdit} disabled={isSaving || isUploadingPhoto} opacity={isSaving ? 0.6 : 1}>
              {isSaving ? "Salvataggio..." : "Salva modifiche"}
            </Button>
            <Button variant="secondary" size="$3" height={40} onPress={() => setIsEditing(false)} disabled={isSaving}>
              Annulla
            </Button>
          </XStack>
        </YStack>
      </Surface>
    );
  }

  const repeatHref = `/preventivo?${new URLSearchParams({
    categoria: request.categorySlug,
    ...(request.city ? { citta: request.city } : {}),
    descrizione: request.description,
    ...(request.address ? { via: request.address } : {}),
    ...(request.houseNumber ? { civico: request.houseNumber } : {}),
    ...(request.addressExtra ? { interno: request.addressExtra } : {}),
    ...(request.postalCode ? { cap: request.postalCode } : {}),
    ...(request.province ? { provincia: request.province } : {}),
    ...(request.recipientName ? { nome: request.recipientName } : {}),
    ...(request.recipientSurname ? { cognome: request.recipientSurname } : {}),
    ...(request.recipientPhone ? { telefono: request.recipientPhone } : {}),
    ...(request.serviceMode ? { modalita: request.serviceMode } : {}),
  }).toString()}`;

  // Azioni del menu hamburger, filtrate per stato: solo quelle che il
  // backend accetta davvero in quel momento (stessi confini già usati dai
  // bottoni inline della scheda espansa).
  const menuActions: CardAction[] = [];
  if (canEditDetails) menuActions.push({ icon: "pencil", text: "Modifica richiesta", onPress: startEditing });
  menuActions.push({ icon: "send", text: "Ripeti la richiesta", onPress: () => router.push(repeatHref) });
  menuActions.push({ icon: "share-2", text: "Condividi riepilogo", onPress: handleShare });
  menuActions.push(
    ...buildPersonalStateActions({
      token,
      guidedRequestId: request.id,
      myState: request.myState,
      isNew: Boolean(isNew),
      onMarkedRead,
      onChanged,
      onError: setError,
    }),
  );
  if (booking && (booking.status === "PENDING" || booking.status === "CONFIRMED")) {
    menuActions.push({ icon: "x", text: "Annulla prenotazione", tone: "danger", onPress: () => setShowCancelModal(true) });
  } else if (booking?.status === "CANCELED") {
    menuActions.push({ icon: "rotate-ccw", text: "Riapri prenotazione", onPress: handleReopenBooking });
  } else if (canDelete) {
    // Annulla ≠ elimina (docs/CHANGELOG.md §130): la richiesta resta visibile
    // come "Annullata da te", i professionisti lo leggono nella cronologia.
    menuActions.push({
      icon: "x",
      text: "Annulla richiesta",
      tone: "danger",
      onPress: handleDelete,
      confirm: {
        question: "Annullare questa richiesta? I professionisti contattati non potranno più inviarti preventivi. Potrai poi archiviarla o eliminarla.",
        confirmLabel: "Sì, annulla",
        busyLabel: "Annullamento...",
      },
    });
  }
  // Eliminazione definitiva: solo dopo l'annullamento o la scadenza, mai con
  // una prenotazione (verificato anche lato API).
  if (request.status === "CLOSED" && !booking) {
    menuActions.push({
      icon: "trash-2",
      text: "Elimina definitivamente",
      tone: "danger",
      onPress: handlePermanentDelete,
      confirm: {
        question: "Eliminare per sempre questa richiesta, con preventivi e conversazioni? L'operazione non si può annullare.",
        confirmLabel: "Elimina",
        busyLabel: "Eliminazione...",
      },
    });
  }

  const nextAction = clientNextAction(stage, request, booking);

  const headingName = booking ?(booking.professionalAccountDeleted ? "Account eliminato" : booking.businessName) : request.categoryLabel;

  return (
    <Surface borderLeftWidth={4} borderLeftColor={STAGE_STYLE[stage].border} gap="$0" padding={0} overflow="hidden">
      <YStack padding="$4" gap="$2" cursor="pointer" onPress={onToggle} accessibilityRole="button">
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2" flexWrap="wrap">
          <XStack gap="$2" flexWrap="wrap" flexShrink={1} minWidth={0}>
            {request.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
            <ClientStagePill stage={stage} />
            <ServiceBadge online={isOnline} />
          </XStack>
          <YStack alignItems="flex-end" gap="$1">
            <Text fontSize={14} color={brand.grafite70}>
              Inviata {formatDateTime(request.createdAt)}
            </Text>
            {stage === "completata" && booking?.finalAmountEurCents != null ? (
              <Text fontFamily="$body" fontWeight="800" fontSize={18} color={brand.grafite}>
                {formatEurCents(booking.finalAmountEurCents)}
              </Text>
            ) : null}
            {isNew ? <Badge variant="nuovo">Nuovo</Badge> : null}
          </YStack>
        </XStack>

        {/* Menu hamburger sulla riga del titolo, non su quella dei badge
            (richiesta esplicita dell'utente: con Urgente + stadio + modalità
            la riga dei badge va a capo e il pulsante finiva in conflitto con
            loro). */}
        <XStack alignItems="flex-start" justifyContent="space-between" gap="$2">
          <Text flex={1} minWidth={0} fontFamily="$heading" fontWeight="800" fontSize={26} color={brand.grafite}>
            {headingName}
          </Text>
          <CardActionsMenu accessibilityLabel="Azioni sulla richiesta" actions={menuActions} />
        </XStack>
        <RequestStateIndicators myState={request.myState} />
        {notice ? (
          <Text color={brand.verificato} fontSize="$3" fontWeight="600">
            {notice}
          </Text>
        ) : null}
        {!isOpen && error ? (
          <Text color={brand.urgenza} fontSize="$3">
            {error}
          </Text>
        ) : null}
        {booking ? (
          <XStack alignItems="center" gap="$1">
            <Icon name="wrench" size={15} color={brand.grafite70} />
            <Text fontSize={16} color={brand.grafite70}>
              {request.categoryLabel} · {request.city || "Online"}
            </Text>
          </XStack>
        ) : (
          <XStack alignItems="center" gap="$1">
            <Icon name="map-pin" size={14} color={brand.grafite70} />
            <Text fontSize={16} color={brand.grafite70}>
              {request.city || (isOnline ? "Consulenza online" : "")}
            </Text>
          </XStack>
        )}
        {stage === "annullata" && booking?.canceledBy ? (
          <Text fontSize={13} fontWeight="700" color={STAGE_STYLE.annullata.fg}>
            Annullata {booking.canceledBy === "PROFESSIONAL" ? "dal professionista" : "da te"}
          </Text>
        ) : null}
        <Text fontSize={16} color={brand.grafite} lineHeight={22}>
          {request.description}
        </Text>

        <XStack justifyContent="center" paddingTop="$1">
          <Icon name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={brand.grafite70} />
        </XStack>
      </YStack>

      {/* "Cosa devi fare ora" (docs/CHANGELOG.md §147): un solo pulsante,
          fuori dall'intestazione cliccabile, che apre la scheda dove si
          compie l'azione. Nascosto a scheda aperta: l'azione è lì sotto. */}
      {nextAction && !isOpen ? (
        <XStack paddingHorizontal="$4" paddingBottom="$4" marginTop="$-2">
          <Button variant="primary" size="$3" height={40} onPress={onToggle}>
            {nextAction}
          </Button>
        </XStack>
      ) : null}

      {isOpen ? (
        <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$4" borderTopWidth={1} borderTopColor={brand.filetto}>
          {stage !== "scaduta" && stage !== "chiusa" ? (
            <YStack gap="$2" paddingTop="$3">
              <Text fontSize={11} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Andamento
              </Text>
              <ClientMiniTimeline stage={stage} />
            </YStack>
          ) : null}

          {statusSummary ? (
            <YStack gap="$1" backgroundColor={brand.gesso} borderRadius="$3" padding="$3">
              {statusSummary.statusMessage ? (
                <Text fontSize="$2" color={brand.grafite70}>
                  {statusSummary.statusMessage}
                </Text>
              ) : (
                <Text fontSize="$2" color={brand.grafite70}>
                  {statusSummary.responded === 0
                    ? `Nessun preventivo ricevuto ancora, su ${statusSummary.totalContacted} professionist${statusSummary.totalContacted === 1 ? "a" : "i"} contattat${statusSummary.totalContacted === 1 ? "o" : "i"}.`
                    : `${statusSummary.responded} preventiv${statusSummary.responded === 1 ? "o" : "i"} ricevut${statusSummary.responded === 1 ? "o" : "i"} su ${statusSummary.totalContacted} professionist${statusSummary.totalContacted === 1 ? "a" : "i"} contattat${statusSummary.totalContacted === 1 ? "o" : "i"}.`}
                </Text>
              )}
            </YStack>
          ) : null}

          {!request.professionalProfileId && averagePriceEurCents !== null ? (
            <XStack alignItems="center" gap="$2" backgroundColor={brand.cianografiaVelo} borderRadius="$3" padding="$3">
              <Icon name="coins" size={16} color={brand.cianografia} strokeWidth={1.5} />
              <Text fontSize="$3" fontWeight="700" color={brand.cianografia}>
                Prezzo totale medio: {formatEurCents(averagePriceEurCents)}
              </Text>
            </XStack>
          ) : null}

          {request.address ? (
            <XStack alignItems="center" gap="$1">
              <Icon name="map-pin" size={14} color={brand.grafite70} strokeWidth={1.5} />
              <Text fontSize="$3" color={brand.grafite70}>
                {request.address}
                {request.city ? `, ${request.city}` : ""}
              </Text>
            </XStack>
          ) : null}

          {request.photoUrls.length > 0 ? (
            <XStack gap="$2" flexWrap="wrap">
              {request.photoUrls.map((url, index) => (
                <MediaPreview key={url} url={url} onClick={() => setOpenPhotoIndex(index)} style={{ width: 72, height: 72, borderRadius: 6, border: `1px solid ${brand.filetto}`, cursor: "pointer" }} />
              ))}
            </XStack>
          ) : null}

          <XStack>
            <Link href={repeatHref} style={{ textDecoration: "none" }}>
              <Text color={brand.cianografia} fontWeight="600" fontSize="$3">
                Ripeti la richiesta
              </Text>
            </Link>
          </XStack>

          {canDelete ? (
            <XStack gap="$2" flexWrap="wrap" alignItems="center">
              {canEditDetails ? (
                <Button variant="secondary" size="$2" height={36} onPress={startEditing}>
                  Modifica
                </Button>
              ) : (
                <Text fontSize="$2" color={brand.grafite70}>
                  Non modificabile: hai già ricevuto un preventivo.
                </Text>
              )}
            </XStack>
          ) : null}
          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}

          {request.sentTo.length > 0 ? (
            <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
              <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
                Inviata a
              </Text>
              {request.sentTo.map((professional) => (
                <XStack key={professional.id} gap="$3" alignItems="center" backgroundColor={brand.gesso} borderRadius="$3" padding="$3" opacity={professional.declined ? 0.7 : 1}>
                  <Link href={`/professionista/${professional.id}`} style={{ textDecoration: "none", color: "inherit", flex: 1 }}>
                    <XStack gap="$3" alignItems="center">
                      <ProfessionalAvatar imageUrl={professional.imageUrl} categorySlug={professional.categorySlug} size={44} />
                      <YStack gap="$1" flex={1}>
                        <XStack gap="$2" alignItems="center" flexWrap="wrap">
                          <Text fontWeight="600" color={brand.grafite}>
                            {professional.businessName}
                          </Text>
                          {professional.verified ? <Badge variant="verificato">Verificato</Badge> : null}
                          {professional.declined ? (
                            <Text fontFamily="$body" fontSize={10} fontWeight="700" color={brand.urgenza}>
                              Ha rifiutato
                            </Text>
                          ) : null}
                        </XStack>
                        <Text color={brand.grafite70} fontSize="$3">
                          {professional.categoryLabel} · {professional.city}
                        </Text>
                        {professional.declined && professional.declineNote ? (
                          <Text color={brand.grafite70} fontSize="$2">
                            {professional.declineNote}
                          </Text>
                        ) : null}
                      </YStack>
                    </XStack>
                  </Link>
                  <XStack alignItems="center" gap="$1" cursor="pointer" accessibilityRole="button" onPress={() => openTimelineForProfessional(professional.id)}>
                    <Text fontSize="$2" fontWeight="600" color={brand.cianografia}>
                      Contatta/Cronologia
                    </Text>
                    <UnreadDot count={effectiveThreadUnread(`${request.id}:${professional.id}`)} />
                  </XStack>
                </XStack>
              ))}
            </YStack>
          ) : null}

          {openTimelineProfessionalId ? (
            <TimelineModal
              token={token}
              guidedRequestId={request.id}
              professionalProfileId={openTimelineProfessionalId}
              viewerRole="CLIENT"
              otherPartyName={request.sentTo.find((p) => p.id === openTimelineProfessionalId)?.businessName ?? null}
              onClose={() => setOpenTimelineProfessionalId(null)}
            />
          ) : null}

          {request.quotes.length > 0 ? (
            <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
              <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
                Preventivi ricevuti
              </Text>
              {request.quotes.map((quote) => (
                <QuoteCard
                  key={quote.id}
                  quote={quote}
                  token={token}
                  onChanged={onChanged}
                  onAcceptQuote={onAcceptQuote}
                  requestedTimeSlot={request.preferredTimeSlot}
                  guidedRequestId={request.id}
                  serviceMode={request.serviceMode}
                  isNew={newQuoteIds?.has(quote.id)}
                  unreadCount={combineUnreadCounts(quoteUnreadCounts?.get(quote.id), threadUnreadCounts?.get(`${request.id}:${quote.professionalProfileId}`))}
                  autoOpenTimeline={autoOpenChatProfessionalId === quote.professionalProfileId}
                />
              ))}
            </YStack>
          ) : (
            <Text color={brand.grafite70} fontSize="$3">
              Nessun preventivo ricevuto ancora.
            </Text>
          )}

          {booking ? (
            <BookingSection
              booking={booking}
              token={token}
              onChanged={onChanged}
              unreadCount={combineUnreadCounts(bookingUnreadCounts?.get(booking.id), threadUnreadCounts?.get(`${request.id}:${booking.professionalProfileId}`))}
            />
          ) : null}

          {openPhotoIndex !== null ? <PhotoLightbox photos={request.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} /> : null}


          <XStack justifyContent="center" paddingTop="$2" cursor="pointer" onPress={onToggle} accessibilityRole="button" accessibilityLabel="Richiudi la scheda">
            <Icon name="chevron-up" size={18} color={brand.grafite70} />
          </XStack>
        </YStack>
      ) : null}

      {/* Fuori dal blocco espanso: "Annulla prenotazione" si apre anche dal
          menu hamburger di una scheda chiusa. */}
      {showCancelModal ? (
        <CancelBookingModal
          title="Annulla prenotazione"
          description="Il professionista verrà avvisato dell'annullamento."
          confirmLabel="Sì, annulla prenotazione"
          confirmingLabel="Annullamento..."
          showNote={false}
          onClose={() => setShowCancelModal(false)}
          onCancel={handleCancelBooking}
        />
      ) : null}
    </Surface>
  );
}
