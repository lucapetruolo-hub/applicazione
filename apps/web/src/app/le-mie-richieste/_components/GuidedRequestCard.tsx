"use client";

import { REQUEST_TIMING_LABEL, type JobPaymentChoice, type RequestWithdrawReason } from "@professionisti/shared";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { ClientBooking, ClientGuidedRequest } from "@professionisti/api-client";
import {
  allItalianCityNames,
  cancellationNoticeLabel,
  isLateCancellation,
  averageQuoteTotalEurCents,
  findComuneByName,
  formatEurCents,
  formatItalianUntil,
  formatServicePriceRange,
  isPlausiblePhoneNumber,
  quotePriceTotals,
  wallClockNow,
  type GuidedRequestStatusSummary,
} from "@professionisti/shared";
import { Autocomplete, Avatar, Badge, BadgeInfo, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { ProfessionalReviewsSummary } from "@/components/ProfessionalReviewsLink";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { MediaPreview } from "@/components/MediaPreview";
import { UploadingDots } from "@/components/UploadingDots";
import { AddressAutocompleteInput } from "@/components/AddressAutocompleteInput";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { ADDRESS_NOT_CHOSEN_MESSAGE, useChosenAddress } from "@/lib/useChosenAddress";
import { CancelBookingModal } from "@/components/CancelBookingModal";
import { ReportIssueModal } from "@/components/ReportIssueModal";
import { TimelineModal } from "@/components/TimelineModal";
import { CardActionsMenu, type CardAction } from "@/components/CardActionsMenu";
import { CardButton } from "@/components/CardButton";
import { ContactButton } from "@/components/ContactButton";
import { ArchivedRestoreBar, buildPersonalStateActions, RequestStateIndicators } from "@/components/RequestCardPersonalActions";
import { combineUnreadCounts } from "@/lib/notificationSections";
import { useInternalLinkClick } from "@/lib/useInternalLinkClick";
import { clientNextAction } from "@/lib/clientNextAction";
import { CLIENT_STAGE_LABEL, type RequestStage } from "@/lib/requestStage";
import { BookingSection, ChangeLinks } from "./BookingSection";
import { QuoteCard } from "./QuoteCard";
import { Disclosure } from "./Disclosure";
import { DeleteRequestModal } from "./DeleteRequestModal";
import { announceRequestDeleted } from "./RequestDeletedNotice";
import { ClientMiniTimeline, ClientStagePill, MAX_REQUEST_PHOTOS, STAGE_STYLE, ServiceBadge, formatDateTime, requestJobAddress, textareaStyle } from "./clientRequestHelpers";

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
  onAcceptQuote: (quoteId: string, paymentMethod: JobPaymentChoice) => Promise<void>;
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
    // Link seguito una volta sola (ref sopra), poi avvisa la pagina: serve un effetto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasQuote) openTimelineForProfessional(autoOpenChatProfessionalId);
    onChatAutoOpenHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenChatProfessionalId]);

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
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
  // Stesse regole della richiesta di preventivo (docs/CHANGELOG.md §214):
  // indirizzo solo della città scelta e preso dall'elenco dei suggerimenti.
  const chosenAddress = useChosenAddress(true);
  const cityComune = findComuneByName(city);
  function changeCity(next: string) {
    const changed = next.trim().toLowerCase() !== city.trim().toLowerCase();
    setCity(next);
    if (!changed) return;
    if (address.trim()) {
      setAddress("");
      setHouseNumber("");
      setPostalCode("");
    }
    chosenAddress.setChosen(false);
    const comune = findComuneByName(next);
    if (comune) setProvince(comune.province);
  }
  const [photoUrls, setPhotoUrls] = useState<string[]>(request.photoUrls);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Uscita dalla modifica (docs/CHANGELOG.md §343): con modifiche non
  // salvate si chiede prima conferma; `href` è la pagina da aprire dopo,
  // null per tornare solo alla scheda.
  const isDirty =
    isEditing &&
    (description !== request.description ||
      city !== request.city ||
      address !== (request.address ?? "") ||
      recipientName !== (request.recipientName ?? "") ||
      recipientSurname !== (request.recipientSurname ?? "") ||
      recipientPhone !== (request.recipientPhone ?? "") ||
      houseNumber !== (request.houseNumber ?? "") ||
      addressExtra !== (request.addressExtra ?? "") ||
      postalCode !== (request.postalCode ?? "") ||
      province !== (request.province ?? "") ||
      photoUrls.join("\n") !== request.photoUrls.join("\n"));
  const [pendingExit, setPendingExit] = useState<{ href: string | null } | null>(null);
  // Il tasto Indietro del browser (o del telefono) mentre si modifica
  // riporta alla scheda, non alla pagina prima: all'apertura del modulo si
  // aggiunge un passo nella cronologia (pushState nativo, che Next.js
  // affianca al proprio router) e lo si toglie uscendo dal modulo.
  const editHistoryPushedRef = useRef(false);
  function leaveEditing() {
    setIsEditing(false);
    if (editHistoryPushedRef.current) {
      editHistoryPushedRef.current = false;
      window.history.back();
    }
  }
  function requestExitEditing() {
    if (isSaving) return;
    if (isDirty) setPendingExit({ href: null });
    else leaveEditing();
  }
  function confirmExitEditing() {
    const href = pendingExit?.href ?? null;
    setPendingExit(null);
    if (href) {
      editHistoryPushedRef.current = false;
      setIsEditing(false);
      router.push(href);
    } else {
      leaveEditing();
    }
  }
  useEffect(() => {
    if (!isEditing) return;
    if (!editHistoryPushedRef.current) {
      window.history.pushState(null, "");
      editHistoryPushedRef.current = true;
    }
    function handlePopState() {
      if (!editHistoryPushedRef.current) return;
      editHistoryPushedRef.current = false;
      if (isDirty) {
        // Resta nel modulo finché non conferma di uscire senza salvare.
        window.history.pushState(null, "");
        editHistoryPushedRef.current = true;
        setPendingExit({ href: null });
      } else {
        setIsEditing(false);
      }
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [isEditing, isDirty]);
  // Un link del menu mentre si modifica: "Le mie richieste" riporta alla
  // scheda invece di lasciare il modulo aperto; con modifiche non salvate
  // qualunque link chiede prima conferma.
  useInternalLinkClick((url, event) => {
    const samePage = url.pathname === window.location.pathname;
    if (isDirty) {
      event.preventDefault();
      setPendingExit({ href: samePage ? null : `${url.pathname}${url.search}${url.hash}` });
    } else if (samePage && url.search === window.location.search) {
      event.preventDefault();
      leaveEditing();
    } else {
      editHistoryPushedRef.current = false;
      setIsEditing(false);
    }
  }, isEditing);
  // Chiusura o ricarica della scheda del browser: avviso del browser stesso.
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);
  const [error, setError] = useState<string | null>(null);
  const [openPhotoIndex, setOpenPhotoIndex] = useState<number | null>(null);
  // "Annulla prenotazione" (una volta accettato un preventivo) apre un
  // modale a sé, CancelBookingModal — stato tenuto qui perché il pulsante
  // che lo apre vive nell'intestazione (unificata con quella della
  // richiesta), non dentro BookingSection.
  const [showCancelModal, setShowCancelModal] = useState(false);
  // "Segnala un problema" vive solo nel menu hamburger (richiesta esplicita
  // dell'utente, docs/CHANGELOG.md §329): modale e chat della prenotazione
  // stanno qui, così si aprono anche da una scheda chiusa.
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBookingChat, setShowBookingChat] = useState(false);
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
  // Preventivo diventato l'intervento: il suo Contatta/Cronologia passa nella sezione dell'intervento.
  const acceptedQuote = booking ? request.quotes.find((quote) => quote.status === "ACCEPTED" && quote.professionalProfileId === booking.professionalProfileId) : undefined;
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
    chosenAddress.setChosen(true);
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
    // Città obbligatoria a domicilio e in ogni richiesta generale (§210).
    if ((request.serviceMode !== "ONLINE" || !request.professionalProfileId) && !city.trim()) {
      setError("Indica la città.");
      return;
    }
    if (city.trim() && !cityComune) {
      setError("Scegli la città dall'elenco dei comuni.");
      return;
    }
    if (request.serviceMode === "HOME" && address.trim() && chosenAddress.missing) {
      setError(ADDRESS_NOT_CHOSEN_MESSAGE);
      return;
    }
    if (recipientPhone.trim() && !isPlausiblePhoneNumber(recipientPhone)) {
      setError("Controlla il numero di telefono: sembra incompleto o troppo lungo.");
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
      leaveEditing();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSaving(false);
    }
  }

  // "Elimina richiesta" (docs/CHANGELOG.md §343), dal modulo di modifica e
  // dal menu: l'errore resta nel popup, che lo mostra da sé.
  async function handleDeleteRequest(reason: RequestWithdrawReason | undefined): Promise<void> {
    await apiClient.deleteGuidedRequest(token, request.id, reason);
    setShowDeleteModal(false);
    leaveEditing();
    announceRequestDeleted(request.id);
    onChanged();
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
          {/* Uscita sempre in vista, anche su un modulo lungo dal telefono (§343). */}
          <XStack
            alignSelf="flex-start"
            alignItems="center"
            gap="$1"
            minHeight={44}
            marginLeft={-6}
            paddingHorizontal={6}
            borderRadius="$3"
            cursor="pointer"
            hoverStyle={{ backgroundColor: brand.filetto }}
            onPress={requestExitEditing}
            accessibilityRole="button"
          >
            <Icon name="chevron-left" size={18} color={brand.grafite} />
            <Text fontSize={16} fontWeight="600" color={brand.grafite}>
              Torna alla richiesta
            </Text>
          </XStack>
          <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
            Modifica · {request.categoryLabel}
          </Text>
          <textarea aria-label="Descrizione del lavoro" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={textareaStyle} />
          <YStack borderWidth={1} borderColor={brand.filetto} borderRadius="$4" backgroundColor={brand.calce}>
            <Autocomplete items={allItalianCityNames()} getKey={(item) => item} getLabel={(item) => item} onSelect={changeCity} value={city} onChangeText={changeCity} placeholder="Città" minChars={3} />
          </YStack>
          {request.serviceMode === "ONLINE" ? (
            <Text fontSize={13} color={brand.grafite70}>
              Per una consulenza online non è obbligatorio indicare la città.
            </Text>
          ) : null}
          <AddressAutocompleteInput
            value={address}
            onChange={(next) => {
              setAddress(next);
              chosenAddress.setChosen(false);
            }}
            onSelect={(selected) => {
              // Suggerimenti di Google: compila anche gli altri campi (docs/CHANGELOG.md §141, §214),
              // città compresa: via e città si scrivono insieme (§264).
              const comune = selected.locality ? findComuneByName(selected.locality) : undefined;
              if (comune || selected.locality) setCity(comune?.name ?? selected.locality ?? "");
              setAddress(selected.street ?? selected.address);
              setHouseNumber(selected.houseNumber ?? "");
              if (selected.postalCode) setPostalCode(selected.postalCode);
              if (selected.province) setProvince(selected.province);
              chosenAddress.setChosen(true);
            }}
            biasTowards={cityComune ? { latitude: cityComune.lat, longitude: cityComune.lon } : null}
            onServiceUnavailable={chosenAddress.markServiceDown}
            placeholder="Indirizzo, es. Via Roma 5, Bari"
            style={textareaStyle}
          />
          {chosenAddress.missing && address.trim() ? (
            <Text fontSize={13} color={brand.grafite70}>
              Scegli l&apos;indirizzo dall&apos;elenco che compare mentre scrivi.
            </Text>
          ) : null}

          <XStack gap="$2" flexWrap="wrap">
            <YStack flex={1} minWidth={160}>
              <input aria-label="Nome" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Nome" style={textareaStyle} />
            </YStack>
            <YStack flex={1} minWidth={160}>
              <input aria-label="Cognome" value={recipientSurname} onChange={(e) => setRecipientSurname(e.target.value)} placeholder="Cognome" style={textareaStyle} />
            </YStack>
          </XStack>
          <PhoneNumberInput value={recipientPhone} onChange={setRecipientPhone} style={textareaStyle} />
          <XStack gap="$2" flexWrap="wrap">
            <YStack flex={1} minWidth={120}>
              <input aria-label="Numero civico" value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="Numero civico" style={textareaStyle} />
            </YStack>
            <YStack flex={1} minWidth={120}>
              <input aria-label="CAP" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="CAP" style={textareaStyle} />
            </YStack>
            <YStack flex={1} minWidth={120}>
              <input aria-label="Provincia" value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Provincia" style={textareaStyle} />
            </YStack>
          </XStack>
          <input aria-label="Scala, piano, interno" value={addressExtra} onChange={(e) => setAddressExtra(e.target.value)} placeholder="Scala, piano, interno (facoltativo)" style={textareaStyle} />

          <YStack gap="$1">
            <Text fontSize={13} color={brand.grafite70}>
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
              <Text color={brand.urgenza} fontSize={13}>
                {photoError}
              </Text>
            ) : null}
          </YStack>

          {error ? (
            <Text color={brand.urgenza} fontSize={16}>
              {error}
            </Text>
          ) : null}
          <XStack gap="$2">
            <CardButton tone="primary" onPress={handleSaveEdit} disabled={isSaving || isUploadingPhoto}>
              {isSaving ? "Salvataggio..." : "Salva modifiche"}
            </CardButton>
            <CardButton onPress={requestExitEditing} disabled={isSaving}>
              Annulla
            </CardButton>
          </XStack>
          {/* Staccato dai pulsanti del salvataggio per non premerlo per sbaglio (§343). */}
          <YStack borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3" marginTop="$2" alignItems="flex-start">
            <CardButton tone="danger" onPress={() => setShowDeleteModal(true)} disabled={isSaving}>
              Elimina richiesta
            </CardButton>
          </YStack>
        </YStack>
        {showDeleteModal ? <DeleteRequestModal stillOpen={canDelete} onClose={() => setShowDeleteModal(false)} onConfirm={handleDeleteRequest} /> : null}
        {pendingExit ? (
          <CancelBookingModal
            title="Uscire senza salvare?"
            description="Le modifiche alla richiesta andranno perse."
            confirmLabel="Esci senza salvare"
            backLabel="Continua a modificare"
            showNote={false}
            onClose={() => setPendingExit(null)}
            onCancel={async () => confirmExitEditing()}
          />
        ) : null}
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
  // "Archivia" accanto a "Elimina richiesta" si confondeva (prova simulata, §343): una riga sotto spiega la differenza.
  for (const action of menuActions) {
    if (action.text === "Archivia" && !booking) action.hint = "La ritrovi in Archiviate";
  }
  // Quali segnalazioni si possono inviare lo decide il server (docs/CHANGELOG.md §164).
  if (booking && booking.issueTypesAllowed.length > 0) {
    menuActions.push({ icon: "flag", text: "Segnala un problema", tone: "danger", onPress: () => setShowReportModal(true) });
  }
  // Cominciato l'appuntamento non si annulla più (§346): per un problema c'è "Segnala un problema".
  if (booking && (booking.status === "PENDING" || booking.status === "CONFIRMED") && new Date(booking.scheduledAt) > wallClockNow()) {
    menuActions.push({ icon: "x", text: "Annulla prenotazione", tone: "danger", onPress: () => setShowCancelModal(true) });
  } else if (booking?.status === "CANCELED") {
    // Un intervento annullato dal professionista non si riapre dal lato cliente.
    if (booking.canceledBy === "CLIENT") {
      menuActions.push({ icon: "rotate-ccw", text: "Riapri prenotazione", onPress: handleReopenBooking });
    }
  } else if (!booking) {
    // Una sola voce finché la richiesta non è diventata un lavoro (§343, al
    // posto di "Annulla richiesta" ed "Elimina definitivamente" del §130).
    menuActions.push({ icon: "trash-2", text: "Elimina richiesta", hint: "La ritiri anche per i professionisti", tone: "danger", onPress: () => setShowDeleteModal(true) });
  }

  const nextAction = clientNextAction(stage, request, booking);

  // Biglietto dell'appuntamento e, sotto, la trattativa chiusa (docs/CHANGELOG.md §346).
  const jobChosen = Boolean(booking && booking.status !== "CANCELED");
  const otherQuotes = request.quotes.filter((quote) => quote.id !== acceptedQuote?.id);
  const quoteCard = (quote: ClientGuidedRequest["quotes"][number]) => (
    <QuoteCard
      key={quote.id}
      quote={quote}
      token={token}
      onChanged={onChanged}
      onAcceptQuote={onAcceptQuote}
      guidedRequestId={request.id}
      serviceMode={request.serviceMode}
      isNew={newQuoteIds?.has(quote.id)}
      unreadCount={combineUnreadCounts(quoteUnreadCounts?.get(quote.id), threadUnreadCounts?.get(`${request.id}:${quote.professionalProfileId}`))}
      autoOpenTimeline={autoOpenChatProfessionalId === quote.professionalProfileId}
      requestOpen={request.status !== "CLOSED"}
      contactInBooking={quote.status === "ACCEPTED" && booking?.professionalProfileId === quote.professionalProfileId}
      notChosen={jobChosen && quote.id !== acceptedQuote?.id}
      onDeleteRequest={!booking ? () => setShowDeleteModal(true) : undefined}
    />
  );
  const acceptedTotals = acceptedQuote ? quotePriceTotals(acceptedQuote.items) : null;
  const bookingView = booking ? (
    <YStack gap="$3">
      <BookingSection
        booking={booking}
        token={token}
        onChanged={onChanged}
        address={requestJobAddress(request)}
        onReportProblem={booking.issueTypesAllowed.length > 0 ? () => setShowReportModal(true) : null}
        unreadCount={combineUnreadCounts(
          bookingUnreadCounts?.get(booking.id),
          threadUnreadCounts?.get(`${request.id}:${booking.professionalProfileId}`),
          // Il pulsante del preventivo accettato è qui: anche i suoi non letti.
          acceptedQuote ? quoteUnreadCounts?.get(acceptedQuote.id) : undefined,
        )}
      />
      <YStack height={1} backgroundColor={brand.filetto} marginVertical="$1" />
      {acceptedQuote && acceptedTotals ? (
        <Disclosure
          title="Preventivo accettato"
          summary={[acceptedQuote.items.map((item) => item.name).join(", "), formatServicePriceRange(acceptedTotals.totalMinEurCents, acceptedTotals.totalMaxEurCents)].filter(Boolean).join(" · ")}
        >
          {quoteCard(acceptedQuote)}
        </Disclosure>
      ) : null}
      {request.photoUrls.length > 0 ? (
        <Disclosure title="Foto della richiesta" summary={String(request.photoUrls.length)}>
          <XStack gap="$2" flexWrap="wrap" paddingHorizontal="$1">
            {request.photoUrls.map((url, index) => (
              <MediaPreview key={url} url={url} onClick={() => setOpenPhotoIndex(index)} style={{ width: 72, height: 72, borderRadius: 10, border: `1px solid ${brand.filetto}`, cursor: "pointer" }} />
            ))}
          </XStack>
        </Disclosure>
      ) : null}
      {otherQuotes.length > 0 ? (
        // Annullato l'appuntamento, gli altri preventivi tornano accettabili e restano aperti.
        <Disclosure
          muted={jobChosen}
          defaultOpen={!jobChosen}
          title={jobChosen ? (otherQuotes.length === 1 ? "1 altro preventivo non scelto" : `${otherQuotes.length} altri preventivi non scelti`) : "Altri preventivi ricevuti"}
        >
          {otherQuotes.map(quoteCard)}
        </Disclosure>
      ) : null}
      <ChangeLinks
        booking={booking}
        onMessage={booking.guidedRequestId ? () => setShowBookingChat(true) : null}
        onCancel={() => setShowCancelModal(true)}
      />
    </YStack>
  ) : null;

  const headingName = booking ?(booking.professionalAccountDeleted ? "Account eliminato" : booking.businessName) : request.categoryLabel;

  return (
    <Surface borderLeftWidth={4} borderLeftColor={STAGE_STYLE[stage].border} gap="$0" padding={0} overflow="hidden">
      <YStack padding="$4" gap="$2" cursor="pointer" onPress={onToggle} accessibilityRole="button">
        <XStack justifyContent="space-between" alignItems="flex-start" gap="$2" flexWrap="wrap">
          <XStack gap="$2" flexWrap="wrap" flexShrink={1} minWidth={0}>
            {request.isUrgent ? <Badge variant="urgente">Urgente</Badge> : null}
            <ClientStagePill stage={stage} />
            <ServiceBadge online={isOnline} />
            {/* Quando serve, scelto alla richiesta (§344): "Oggi" è già il badge Urgente. */}
            {request.timing === "WEEK" || request.timing === "CALM" ? (
              <Text fontSize={13} fontWeight="600" color={brand.grafite70} alignSelf="center">
                {REQUEST_TIMING_LABEL[request.timing]}
              </Text>
            ) : null}
          </XStack>
          <YStack alignItems="flex-end" gap="$1">
            <Text fontSize={16} color={brand.grafite70}>
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
          {/* Foto del professionista accanto al nome quando la richiesta è
              diventata un lavoro (richiesta esplicita dell'utente),
              iniziali se manca; prima il titolo è la categoria, nessuna foto. */}
          <XStack flex={1} minWidth={0} alignItems="center" gap="$2">
            {booking && !booking.professionalAccountDeleted ? <Avatar name={booking.businessName} imageUrl={booking.professionalImageUrl} size={40} /> : null}
            <Text flex={1} minWidth={0} fontFamily="$heading" fontWeight="800" fontSize={26} color={brand.grafite}>
              {headingName}
            </Text>
          </XStack>
          <CardActionsMenu accessibilityLabel="Azioni sulla richiesta" actions={menuActions} />
        </XStack>
        <RequestStateIndicators myState={request.myState} />
        {notice ? (
          <Text color={brand.verificato} fontSize={16} fontWeight="600">
            {notice}
          </Text>
        ) : null}
        {!isOpen && error ? (
          <Text color={brand.urgenza} fontSize={16}>
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
        {request.sentWith && request.sentWith.length > 0 ? (
          // Richieste nate dallo stesso invio con più categorie (docs/CHANGELOG.md §259).
          <XStack alignItems="center" gap="$1">
            <Icon name="send" size={14} color={brand.grafite70} />
            <Text fontSize={16} color={brand.grafite70}>
              Inviata insieme a {new Intl.ListFormat("it-IT", { type: "conjunction" }).format(request.sentWith.map((other) => other.categoryLabel))}
            </Text>
          </XStack>
        ) : null}
        {stage === "annullata" && booking?.canceledBy ? (
          <Text fontSize={16} fontWeight="700" color={STAGE_STYLE.annullata.fg}>
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
          <CardButton tone="primary" onPress={onToggle}>
            {nextAction}
          </CardButton>
        </XStack>
      ) : null}
      <ArchivedRestoreBar token={token} guidedRequestId={request.id} myState={request.myState} onChanged={onChanged} />

      {isOpen ? (
        <YStack paddingHorizontal="$4" paddingBottom="$4" gap="$4" borderTopWidth={1} borderTopColor={brand.filetto}>
          {/* Con un lavoro la scheda parte dal biglietto dell'appuntamento (§346):
              andamento, riepiloghi e trattativa stanno sotto o spariscono. */}
          {booking ? bookingView : null}

          {stage !== "scaduta" && stage !== "chiusa" && !booking ? (
            <YStack gap="$2" paddingTop="$3">
              <Text fontSize={13} fontWeight="800" color={brand.grafite70} textTransform="uppercase">
                Andamento
              </Text>
              <ClientMiniTimeline stage={stage} />
            </YStack>
          ) : null}

          {statusSummary && !booking ? (
            <YStack gap="$1" backgroundColor={brand.gesso} borderRadius="$3" padding="$3">
              {statusSummary.statusMessage ? (
                <Text fontSize={13} color={brand.grafite70}>
                  {statusSummary.statusMessage}
                </Text>
              ) : (
                <Text fontSize={13} color={brand.grafite70}>
                  {/* Richiesta generale: senza il numero dei professionisti contattati (docs/CHANGELOG.md §211). */}
                  {!request.professionalProfileId
                    ? statusSummary.responded === 0
                      ? "Nessun preventivo ricevuto ancora."
                      : `${statusSummary.responded} preventiv${statusSummary.responded === 1 ? "o" : "i"} ricevut${statusSummary.responded === 1 ? "o" : "i"}.`
                    : statusSummary.responded === 0
                    ? `Nessun preventivo ricevuto ancora, su ${statusSummary.totalContacted} professionist${statusSummary.totalContacted === 1 ? "a" : "i"} contattat${statusSummary.totalContacted === 1 ? "o" : "i"}.`
                    : `${statusSummary.responded} preventiv${statusSummary.responded === 1 ? "o" : "i"} ricevut${statusSummary.responded === 1 ? "o" : "i"} su ${statusSummary.totalContacted} professionist${statusSummary.totalContacted === 1 ? "a" : "i"} contattat${statusSummary.totalContacted === 1 ? "o" : "i"}.`}
                </Text>
              )}
            </YStack>
          ) : null}

          {request.openUntil ? (
            <XStack alignItems="center" gap="$2">
              <Icon name="clock" size={14} color={brand.grafite70} strokeWidth={1.5} />
              <Text fontSize={16} color={brand.grafite70}>
                La richiesta resta aperta ai preventivi fino {formatItalianUntil(request.openUntil)}.
              </Text>
            </XStack>
          ) : null}

          {!request.professionalProfileId && averagePriceEurCents !== null && !booking ? (
            <XStack alignItems="center" gap="$2" backgroundColor={brand.cianografiaVelo} borderRadius="$3" padding="$3">
              <Icon name="coins" size={16} color={brand.cianografiaScuro} strokeWidth={1.5} />
              <Text fontSize={16} fontWeight="700" color={brand.cianografiaScuro}>
                Prezzo totale medio: {formatEurCents(averagePriceEurCents)}
              </Text>
            </XStack>
          ) : null}

          {request.address && !booking ? (
            <XStack alignItems="center" gap="$1">
              <Icon name="map-pin" size={14} color={brand.grafite70} strokeWidth={1.5} />
              <Text fontSize={16} color={brand.grafite70}>
                {request.address}
                {request.city ? `, ${request.city}` : ""}
              </Text>
            </XStack>
          ) : null}

          {request.photoUrls.length > 0 && !booking ? (
            <XStack gap="$2" flexWrap="wrap">
              {request.photoUrls.map((url, index) => (
                <MediaPreview key={url} url={url} onClick={() => setOpenPhotoIndex(index)} style={{ width: 72, height: 72, borderRadius: 10, border: `1px solid ${brand.filetto}`, cursor: "pointer" }} />
              ))}
            </XStack>
          ) : null}

          {/* "Ripeti la richiesta" e "Modifica" sulla stessa riga, con bordo
              come gli altri pulsanti della scheda (docs/CHANGELOG.md §195:
              prima il primo era solo testo e il secondo più piccolo). */}
          {booking ? null : (
            <XStack gap="$2" flexWrap="wrap" alignItems="center">
              {canDelete && canEditDetails ? <CardButton onPress={startEditing}>Modifica</CardButton> : null}
              <Link href={repeatHref} style={{ textDecoration: "none" }}>
                <CardButton>Ripeti la richiesta</CardButton>
              </Link>
            </XStack>
          )}
          {canDelete && !canEditDetails ? (
            <Text fontSize={13} color={brand.grafite70}>
              Non modificabile: hai già ricevuto un preventivo.
            </Text>
          ) : null}
          {error ? (
            <Text color={brand.urgenza} fontSize={16}>
              {error}
            </Text>
          ) : null}

          {/* Elenco dei destinatari solo per una richiesta diretta: una generale arriva a tutti i professionisti della zona (§211). */}
          {request.professionalProfileId && request.sentTo.length > 0 && !booking ? (
            <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
              <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
                Inviata a
              </Text>
              {request.sentTo.map((professional) => (
                <XStack key={professional.id} gap="$3" alignItems="center" backgroundColor={brand.gesso} borderRadius="$3" padding="$3" opacity={professional.declined ? 0.7 : 1}>
                  <Link href={`/professionista/${professional.id}`} style={{ textDecoration: "none", color: "inherit", flex: 1, minWidth: 0 }}>
                    <XStack gap="$3" alignItems="center">
                      <ProfessionalAvatar imageUrl={professional.imageUrl} categorySlug={professional.categorySlug} size={44} />
                      <YStack gap="$1" flex={1} minWidth={0}>
                        <XStack gap="$2" alignItems="center" flexWrap="wrap">
                          <Text fontWeight="600" color={brand.grafite}>
                            {professional.businessName}
                          </Text>
                          {professional.verified ? (
                            <BadgeInfo info="verified">
                              <Badge variant="verificato">Verificato</Badge>
                            </BadgeInfo>
                          ) : null}
                          {professional.declined ? (
                            <Text fontFamily="$body" fontSize={10} fontWeight="700" color={brand.urgenza}>
                              Ha rifiutato
                            </Text>
                          ) : null}
                        </XStack>
                        <Text color={brand.grafite70} fontSize={16}>
                          {professional.categoryLabel} · {professional.city}
                        </Text>
                        <ProfessionalReviewsSummary reviews={professional.reviews} />
                        {professional.declined && professional.declineNote ? (
                          <Text color={brand.grafite70} fontSize={13}>
                            {professional.declineNote}
                          </Text>
                        ) : null}
                      </YStack>
                    </XStack>
                  </Link>
                  {/* "Messaggi" leggero come nei preventivi (§338): da telefono l'icona tonda lascia spazio a nome e stelle (§342). */}
                  <ContactButton
                    light
                    unreadCount={effectiveThreadUnread(`${request.id}:${professional.id}`)}
                    onPress={() => openTimelineForProfessional(professional.id)}
                  />
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
              otherPartyImageUrl={request.sentTo.find((p) => p.id === openTimelineProfessionalId)?.imageUrl ?? null}
              onClose={() => setOpenTimelineProfessionalId(null)}
            />
          ) : null}

          {booking ? null : request.quotes.length > 0 ? (
            <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
              <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
                Preventivi ricevuti
              </Text>
              {request.quotes.map(quoteCard)}
            </YStack>
          ) : (
            <Text color={brand.grafite70} fontSize={16}>
              Nessun preventivo ricevuto ancora.
            </Text>
          )}

          {openPhotoIndex !== null ? <PhotoLightbox photos={request.photoUrls} initialIndex={openPhotoIndex} onClose={() => setOpenPhotoIndex(null)} /> : null}


          <XStack justifyContent="center" paddingTop="$2" cursor="pointer" onPress={onToggle} accessibilityRole="button" accessibilityLabel="Richiudi la scheda">
            <Icon name="chevron-up" size={18} color={brand.grafite70} />
          </XStack>
        </YStack>
      ) : null}

      {/* Fuori dal blocco espanso: "Segnala un problema" e "Annulla
          prenotazione" si aprono anche dal menu hamburger di una scheda chiusa. */}
      {showReportModal && booking ? (
        <ReportIssueModal
          businessName={booking.businessName}
          phone={booking.professionalPhone}
          email={booking.professionalEmail}
          allowedTypes={booking.issueTypesAllowed}
          assisted={booking.payment?.method !== "DIRECT"}
          onClose={() => {
            setShowReportModal(false);
            onChanged();
          }}
          onSubmit={async (input) => {
            await apiClient.reportJobIssue(token, booking.id, input);
          }}
          onOpenChat={
            booking.guidedRequestId
              ? () => {
                  setShowReportModal(false);
                  setShowBookingChat(true);
                  onChanged();
                }
              : undefined
          }
          uploadPhoto={(file) => apiClient.uploadBookingCompletionPhoto(token, file).then((r) => r.imageUrl)}
        />
      ) : null}
      {showBookingChat && booking?.guidedRequestId ? (
        <TimelineModal
          token={token}
          guidedRequestId={booking.guidedRequestId}
          professionalProfileId={booking.professionalProfileId}
          viewerRole="CLIENT"
          otherPartyName={booking.businessName}
          otherPartyImageUrl={booking.professionalImageUrl}
          onClose={() => setShowBookingChat(false)}
        />
      ) : null}
      {showDeleteModal ? <DeleteRequestModal stillOpen={canDelete} onClose={() => setShowDeleteModal(false)} onConfirm={handleDeleteRequest} /> : null}
      {showCancelModal ? (
        <CancelBookingModal
          title="Annulla prenotazione"
          description={
            booking && isLateCancellation(booking.scheduledAt, booking.cancellationNoticeHours)
              ? `Il professionista verrà avvisato. Mancano meno di ${cancellationNoticeLabel(booking.cancellationNoticeHours)}, il preavviso che aveva chiesto.`
              : "Il professionista verrà avvisato dell'annullamento."
          }
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
