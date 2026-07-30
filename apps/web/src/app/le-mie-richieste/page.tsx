"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { ClientBooking, ClientGuidedRequest } from "@professionisti/api-client";
import { ALL_ITALIAN_CITY_NAMES, formatServicePriceRange } from "@professionisti/shared";
import { Autocomplete, Badge, Button, EmptyState, Icon, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AccountSidebar } from "@/components/AccountSidebar";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { LoadingState } from "@/components/LoadingState";

const STATUS_LABEL: Record<ClientGuidedRequest["status"], string> = {
  OPEN: "In attesa di risposte",
  MATCHED: "Inviata ai professionisti",
  CLOSED: "Chiusa",
};

const MAX_REVIEW_PHOTOS = 3;

const BOOKING_STATUS_LABEL: Record<ClientBooking["status"], string> = {
  PENDING: "In attesa",
  CONFIRMED: "Confermata",
  COMPLETED: "Completata",
  CANCELED: "Annullata",
  NO_SHOW: "Non presentato",
};

const textareaStyle = {
  padding: 10,
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 14,
  fontFamily: "inherit",
  color: brand.grafite,
  resize: "vertical" as const,
};

export default function LeMieRichiestePage() {
  const { user, token, isLoading } = useAuth();
  const [requests, setRequests] = useState<ClientGuidedRequest[] | null>(null);
  const [bookings, setBookings] = useState<ClientBooking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptingQuoteId, setAcceptingQuoteId] = useState<string | null>(null);

  function reload() {
    if (!token) return;
    apiClient
      .myGuidedRequests(token)
      .then(setRequests)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore nel caricamento delle richieste."));
    apiClient.myClientBookings(token).then(setBookings).catch(() => setBookings([]));
  }

  useEffect(reload, [token]);

  async function handleAcceptQuote(quoteId: string) {
    if (!token) return;
    setAcceptingQuoteId(quoteId);
    setError(null);
    try {
      await apiClient.acceptQuote(token, quoteId);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setAcceptingQuoteId(null);
    }
  }

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi per vedere le tue richieste
          </Text>
          <Link href="/accedi?redirect=/le-mie-richieste" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      <XStack width="100%" maxWidth={900} gap="$8" alignItems="flex-start" flexWrap="wrap">
        <AccountSidebar />

        <YStack flex={1} minWidth={280} gap="$7">
          <YStack gap="$4">
            <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
              Le mie richieste
            </Text>

            {error ? <Text color={brand.urgenza}>{error}</Text> : null}

            {requests === null ? (
              <LoadingState />
            ) : requests.length === 0 ? (
              <EmptyState
                icon="file-text"
                title="Nessuna richiesta inviata"
                description="Non hai ancora inviato nessuna richiesta di preventivo."
                action={
                  <Link href="/preventivo" style={{ textDecoration: "none" }}>
                    <Text color={brand.cianografia} fontWeight="600">
                      Richiedi il tuo primo preventivo
                    </Text>
                  </Link>
                }
              />
            ) : (
              requests.map((request) => (
                <GuidedRequestCard
                  key={request.id}
                  request={request}
                  token={token}
                  onChanged={reload}
                  acceptingQuoteId={acceptingQuoteId}
                  onAcceptQuote={handleAcceptQuote}
                />
              ))
            )}
          </YStack>

          <YStack gap="$4">
            <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
              Le mie prenotazioni
            </Text>
            {bookings === null ? (
              <LoadingState />
            ) : bookings.length === 0 ? (
              <EmptyState icon="receipt-text" title="Nessuna prenotazione" description="Accetta un preventivo per crearne una." />
            ) : (
              bookings.map((booking) => <BookingRow key={booking.id} booking={booking} token={token} onReviewed={reload} />)
            )}
          </YStack>
        </YStack>
      </XStack>
    </YStack>
  );
}

function GuidedRequestCard({
  request,
  token,
  onChanged,
  acceptingQuoteId,
  onAcceptQuote,
}: {
  request: ClientGuidedRequest;
  token: string;
  onChanged: () => void;
  acceptingQuoteId: string | null;
  onAcceptQuote: (quoteId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(request.description);
  const [city, setCity] = useState(request.city);
  const [address, setAddress] = useState(request.address ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Una richiesta CLOSED ha già portato a una prenotazione: non ha senso
  // modificarla o eliminarla a quel punto (stesso confine applicato lato
  // API in GuidedRequestsService).
  const canEdit = request.status !== "CLOSED";

  function startEditing() {
    setDescription(request.description);
    setCity(request.city);
    setAddress(request.address ?? "");
    setError(null);
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    setError(null);
    if (description.trim().length < 10) {
      setError("Descrivi il lavoro con almeno 10 caratteri.");
      return;
    }
    if (!city.trim()) {
      setError("Indica la città.");
      return;
    }
    setIsSaving(true);
    try {
      await apiClient.updateGuidedRequest(token, request.id, {
        description: description.trim(),
        city: city.trim(),
        address: address.trim() || undefined,
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
    setIsDeleting(true);
    try {
      await apiClient.deleteGuidedRequest(token, request.id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setConfirmingDelete(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <Surface gap="$3">
      {isEditing ? (
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
            {request.categoryLabel}
          </Text>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={textareaStyle} />
          <YStack borderWidth={1} borderColor={brand.filetto} borderRadius="$4" backgroundColor={brand.calce}>
            <Autocomplete
              items={ALL_ITALIAN_CITY_NAMES}
              getKey={(item) => item}
              getLabel={(item) => item}
              onSelect={setCity}
              value={city}
              onChangeText={setCity}
              placeholder="Città"
              minChars={3}
            />
          </YStack>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Indirizzo preciso (opzionale): via e numero civico"
            style={textareaStyle}
          />
          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}
          <XStack gap="$2">
            <Button variant="primary" size="$3" height={40} onPress={handleSaveEdit} disabled={isSaving} opacity={isSaving ? 0.6 : 1}>
              {isSaving ? "Salvataggio..." : "Salva modifiche"}
            </Button>
            <Button variant="secondary" size="$3" height={40} onPress={() => setIsEditing(false)} disabled={isSaving}>
              Annulla
            </Button>
          </XStack>
        </YStack>
      ) : (
        <>
          <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
            <YStack gap="$1">
              <Text fontFamily="$heading" fontWeight="700" fontSize="$5" color={brand.grafite}>
                {request.categoryLabel} · {request.city}
              </Text>
              <Text color={brand.grafite70}>{request.description}</Text>
              {request.address ? (
                <XStack alignItems="center" gap="$1">
                  <Icon name="map-pin" size={12} color={brand.grafite70} strokeWidth={1.5} />
                  <Text fontSize="$2" color={brand.grafite70}>
                    {request.address}
                  </Text>
                </XStack>
              ) : null}
            </YStack>
            <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" color={brand.cianografia} fontWeight="600">
              {STATUS_LABEL[request.status]}
            </Text>
          </YStack>

          {canEdit ? (
            <XStack gap="$2" flexWrap="wrap" alignItems="center">
              <Button variant="secondary" size="$2" height={36} onPress={startEditing}>
                Modifica
              </Button>
              {confirmingDelete ? (
                <>
                  <Text fontSize="$2" color={brand.urgenza}>
                    Eliminare questa richiesta?
                  </Text>
                  <Button variant="urgent" size="$2" height={36} onPress={handleDelete} disabled={isDeleting} opacity={isDeleting ? 0.6 : 1}>
                    {isDeleting ? "Eliminazione..." : "Conferma"}
                  </Button>
                  <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingDelete(false)}>
                    Annulla
                  </Button>
                </>
              ) : (
                <Text
                  color={brand.urgenza}
                  fontWeight="600"
                  fontSize="$3"
                  cursor="pointer"
                  accessibilityRole="button"
                  onPress={() => setConfirmingDelete(true)}
                >
                  Elimina
                </Text>
              )}
            </XStack>
          ) : null}
          {error ? (
            <Text color={brand.urgenza} fontSize="$3">
              {error}
            </Text>
          ) : null}
        </>
      )}

      {request.sentTo.length > 0 ? (
        <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
          <Text fontFamily="$mono" fontSize={11} fontWeight="600" textTransform="uppercase" color={brand.grafite70}>
            Inviata a
          </Text>
          {request.sentTo.map((professional) => (
            <Link
              key={professional.id}
              href={`/professionista/${professional.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <XStack gap="$3" alignItems="center" backgroundColor={brand.gesso} borderRadius="$3" padding="$3">
                <ProfessionalAvatar imageUrl={professional.imageUrl} categorySlug={professional.categorySlug} size={44} />
                <YStack gap="$1" flex={1}>
                  <XStack gap="$2" alignItems="center" flexWrap="wrap">
                    <Text fontWeight="600" color={brand.grafite}>
                      {professional.businessName}
                    </Text>
                    {professional.verified ? <Badge variant="verificato">Verificato</Badge> : null}
                  </XStack>
                  <Text color={brand.grafite70} fontSize="$3">
                    {professional.categoryLabel} · {professional.city}
                  </Text>
                </YStack>
              </XStack>
            </Link>
          ))}
        </YStack>
      ) : null}

      {request.quotes.length > 0 ? (
        <YStack gap="$2" borderTopWidth={1} borderTopColor={brand.filetto} paddingTop="$3">
          <Text fontFamily="$mono" fontSize={11} fontWeight="600" textTransform="uppercase" color={brand.grafite70}>
            Preventivi ricevuti
          </Text>
          {request.quotes.map((quote) => (
            <QuoteCard
              key={quote.id}
              quote={quote}
              token={token}
              onChanged={onChanged}
              acceptingQuoteId={acceptingQuoteId}
              onAcceptQuote={onAcceptQuote}
            />
          ))}
        </YStack>
      ) : (
        <Text color={brand.grafite70} fontSize="$3">
          Nessun preventivo ricevuto ancora.
        </Text>
      )}
    </Surface>
  );
}

function formatQuoteDate(iso: string): string {
  const date = new Date(iso);
  return `${date.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })} · ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}`;
}

type FreeSlot = { date: string; startTime: string; endTime: string };

/**
 * Preventivo ricevuto: mostra la data proposta dal professionista (prima
 * non era visibile affatto) e permette al cliente di accettarla o
 * proporne un'altra, scelta tra le fasce libere reali dell'agenda del
 * professionista (mai una data a caso — richiesta esplicita dell'utente).
 */
function QuoteCard({
  quote,
  token,
  onChanged,
  acceptingQuoteId,
  onAcceptQuote,
}: {
  quote: ClientGuidedRequest["quotes"][number];
  token: string;
  onChanged: () => void;
  acceptingQuoteId: string | null;
  onAcceptQuote: (quoteId: string) => void;
}) {
  const [isChoosingDate, setIsChoosingDate] = useState(false);
  const [freeSlots, setFreeSlots] = useState<FreeSlot[] | null>(null);
  const [selectedSlotKey, setSelectedSlotKey] = useState("");
  const [proposeNote, setProposeNote] = useState("");
  const [isProposing, setIsProposing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startChoosingDate() {
    setError(null);
    setIsChoosingDate(true);
    if (freeSlots === null) {
      try {
        const agenda = await apiClient.getProfessionalAgenda(quote.professionalProfileId);
        const slots: FreeSlot[] = [];
        for (const day of agenda.days) {
          for (const slot of day.slots) {
            if (slot.maxBookings === 1 && slot.bookedCount < slot.maxBookings) {
              slots.push({ date: day.date, startTime: slot.startTime, endTime: slot.endTime });
            }
          }
        }
        setFreeSlots(slots);
        if (slots[0]) setSelectedSlotKey(`${slots[0].date}|${slots[0].startTime}|${slots[0].endTime}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento degli orari disponibili.");
      }
    }
  }

  async function handleProposeDate() {
    const [date, startTime, endTime] = selectedSlotKey.split("|");
    if (!date || !startTime || !endTime) {
      setError("Scegli un orario.");
      return;
    }
    setError(null);
    setIsProposing(true);
    try {
      await apiClient.proposeQuoteDate(token, quote.id, { date, startTime, endTime, note: proposeNote.trim() || undefined });
      setIsChoosingDate(false);
      setProposeNote("");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsProposing(false);
    }
  }

  return (
    <YStack backgroundColor={brand.gesso} borderRadius="$3" padding="$3" gap="$2">
      <Text fontWeight="600" color={brand.grafite}>
        {quote.businessName}
      </Text>
      <Text fontSize="$3" color={brand.grafite70}>
        Data proposta: {formatQuoteDate(quote.estimatedStartDate)}
      </Text>
      <YStack gap="$1">
        {quote.items.map((item) => (
          <Text key={item.id} color={brand.grafite70} fontSize="$3">
            {item.name}: {formatServicePriceRange(item.priceMinEurCents, item.priceMaxEurCents)}
          </Text>
        ))}
      </YStack>
      {quote.notes ? (
        <Text color={brand.grafite70} fontSize="$3">
          {quote.notes}
        </Text>
      ) : null}

      {quote.status === "SENT" ? (
        <>
          <XStack gap="$2" flexWrap="wrap">
            <Button
              variant="primary"
              size="$3"
              height={40}
              onPress={() => onAcceptQuote(quote.id)}
              disabled={acceptingQuoteId === quote.id}
              opacity={acceptingQuoteId === quote.id ? 0.6 : 1}
            >
              {acceptingQuoteId === quote.id ? "Conferma..." : "Accetta preventivo"}
            </Button>
            {!isChoosingDate ? (
              <Button variant="secondary" size="$3" height={40} onPress={startChoosingDate}>
                Proponi altra data
              </Button>
            ) : null}
          </XStack>
          {isChoosingDate ? (
            <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
              {freeSlots === null ? (
                <Text fontSize="$2" color={brand.grafite70}>
                  Caricamento orari disponibili...
                </Text>
              ) : freeSlots.length === 0 ? (
                <Text fontSize="$2" color={brand.grafite70}>
                  Nessun orario libero nell&apos;agenda pubblica di questo professionista al momento.
                </Text>
              ) : (
                <>
                  <select value={selectedSlotKey} onChange={(e) => setSelectedSlotKey(e.target.value)} style={textareaStyle}>
                    {freeSlots.map((slot) => {
                      const key = `${slot.date}|${slot.startTime}|${slot.endTime}`;
                      const label = `${new Date(`${slot.date}T00:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} · ${slot.startTime}–${slot.endTime}`;
                      return (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                  <textarea
                    value={proposeNote}
                    onChange={(e) => setProposeNote(e.target.value)}
                    placeholder="Dettagli aggiuntivi (opzionale): es. posso solo dopo le 17"
                    rows={2}
                    style={textareaStyle}
                  />
                  <XStack gap="$2">
                    <Button variant="primary" size="$3" height={40} onPress={handleProposeDate} disabled={isProposing} opacity={isProposing ? 0.6 : 1}>
                      {isProposing ? "Invio..." : "Invia proposta"}
                    </Button>
                    <Button variant="ghost" size="$3" height={40} onPress={() => setIsChoosingDate(false)} disabled={isProposing}>
                      Annulla
                    </Button>
                  </XStack>
                </>
              )}
            </YStack>
          ) : null}
        </>
      ) : quote.status === "MODIFICATION_REQUESTED" ? (
        <YStack gap="$1">
          <Text fontSize="$2" color={brand.ottone} fontWeight="600">
            In attesa di conferma del professionista per il {quote.clientProposedDate ? formatQuoteDate(quote.clientProposedDate) : ""}
          </Text>
          {quote.clientProposedNote ? (
            <Text fontSize="$2" color={brand.grafite70}>
              {quote.clientProposedNote}
            </Text>
          ) : null}
        </YStack>
      ) : quote.status === "ACCEPTED" ? (
        <Text fontSize="$2" color={brand.verificato} fontWeight="600">
          Accettato
        </Text>
      ) : null}

      {error ? (
        <Text color={brand.urgenza} fontSize="$3">
          {error}
        </Text>
      ) : null}
    </YStack>
  );
}

function BookingRow({ booking, token, onReviewed }: { booking: ClientBooking; token: string; onReviewed: () => void }) {
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  async function handleCancelBooking() {
    setCancelError(null);
    setIsCanceling(true);
    try {
      await apiClient.cancelMyBooking(token, booking.id);
      onReviewed();
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setConfirmingCancel(false);
    } finally {
      setIsCanceling(false);
    }
  }

  async function handleSubmitReview() {
    setError(null);
    setIsSubmitting(true);
    try {
      await apiClient.createReview(token, { bookingId: booking.id, rating, comment: comment.trim() || undefined, photoUrls });
      setShowReviewForm(false);
      onReviewed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setIsUploadingPhoto(true);
    try {
      // Cloudinary ridimensiona e comprime lato server, stessa trasformazione
      // già usata per le foto della richiesta guidata e per l'immagine
      // profilo professionista.
      const result = await apiClient.uploadReviewPhoto(token, file);
      setPhotoUrls((prev) => [...prev, result.imageUrl].slice(0, MAX_REVIEW_PHOTOS));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Errore durante il caricamento della foto.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  return (
    <Surface gap="$2">
      <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
        <Text fontWeight="600" color={brand.grafite}>
          {booking.businessName}
        </Text>
        <Text fontFamily="$mono" fontSize={11} textTransform="uppercase" color={brand.cianografia} fontWeight="600">
          {BOOKING_STATUS_LABEL[booking.status]}
        </Text>
      </YStack>
      <Text color={brand.grafite70} fontSize="$3">
        {new Date(booking.scheduledAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
      </Text>

      {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          {confirmingCancel ? (
            <>
              <Text fontSize="$2" color={brand.urgenza}>
                Annullare questa prenotazione?
              </Text>
              <Button variant="urgent" size="$2" height={36} onPress={handleCancelBooking} disabled={isCanceling} opacity={isCanceling ? 0.6 : 1}>
                {isCanceling ? "Annullamento..." : "Conferma"}
              </Button>
              <Button variant="ghost" size="$2" height={36} onPress={() => setConfirmingCancel(false)}>
                Torna indietro
              </Button>
            </>
          ) : (
            <Text
              color={brand.urgenza}
              fontWeight="600"
              fontSize="$3"
              cursor="pointer"
              accessibilityRole="button"
              onPress={() => setConfirmingCancel(true)}
            >
              Annulla prenotazione
            </Text>
          )}
        </XStack>
      ) : null}
      {cancelError ? (
        <Text color={brand.urgenza} fontSize="$3">
          {cancelError}
        </Text>
      ) : null}

      {booking.status === "COMPLETED" && !booking.hasReview ? (
        showReviewForm ? (
          <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor={brand.filetto}>
            <YStack flexDirection="row" gap="$1">
              {[1, 2, 3, 4, 5].map((value) => (
                <YStack
                  key={value}
                  cursor="pointer"
                  onPress={() => setRating(value)}
                  accessibilityRole="button"
                  accessibilityLabel={`${value} stelle`}
                >
                  <Icon name="star" size={24} strokeWidth={1.5} color={brand.ottone} fill={value <= rating ? brand.ottone : "none"} />
                </YStack>
              ))}
            </YStack>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Com'è andata? (opzionale)"
              rows={2}
              style={textareaStyle}
            />

            <YStack gap="$1">
              <Text fontSize="$2" color={brand.grafite70}>
                Foto del lavoro svolto (opzionale, fino a {MAX_REVIEW_PHOTOS})
              </Text>
              <YStack flexDirection="row" flexWrap="wrap" gap="$2">
                {photoUrls.map((url) => (
                  <YStack key={url} width={64} height={64} borderRadius="$3" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
                {photoUrls.length < MAX_REVIEW_PHOTOS ? (
                  <YStack
                    width={64}
                    height={64}
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
                    <Text fontSize="$6" color={brand.grafite70}>
                      {isUploadingPhoto ? "…" : "+"}
                    </Text>
                  </YStack>
                ) : null}
              </YStack>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                onChange={handlePhotoChange}
                disabled={isUploadingPhoto}
                style={{ display: "none" }}
              />
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
            <Button
              variant="primary"
              size="$3"
              height={40}
              alignSelf="flex-start"
              onPress={handleSubmitReview}
              disabled={isSubmitting || isUploadingPhoto}
              opacity={isSubmitting || isUploadingPhoto ? 0.6 : 1}
            >
              {isSubmitting ? "Invio..." : "Invia recensione"}
            </Button>
          </YStack>
        ) : (
          <Button variant="secondary" size="$3" height={40} alignSelf="flex-start" onPress={() => setShowReviewForm(true)}>
            Lascia una recensione
          </Button>
        )
      ) : booking.status === "COMPLETED" && booking.hasReview ? (
        <Text fontSize="$2" color={brand.verificato} fontWeight="600">
          Recensione inviata
        </Text>
      ) : null}
    </Surface>
  );
}
