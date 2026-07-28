"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import type { ClientBooking, ClientGuidedRequest } from "@professionisti/api-client";
import { ALL_ITALIAN_CITY_NAMES } from "@professionisti/shared";
import { Autocomplete, Button, H1, H2, Paragraph, Text, XStack, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AccountSidebar } from "@/components/AccountSidebar";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";

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
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi per vedere le tue richieste
          </H1>
          <Link href="/accedi?redirect=/le-mie-richieste" style={{ textDecoration: "none" }}>
            <Text color="$blue10" fontWeight="600">
              Vai al login
            </Text>
          </Link>
        </YStack>
      </YStack>
    );
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <XStack width="100%" maxWidth={900} gap="$8" alignItems="flex-start" flexWrap="wrap">
        <AccountSidebar />

        <YStack flex={1} minWidth={280} gap="$6">
          <YStack gap="$5">
            <H1 size="$8">Le mie richieste</H1>

            {error ? <Text color="$red10">{error}</Text> : null}

            {requests === null ? (
              <Text color="$color9">Caricamento...</Text>
            ) : requests.length === 0 ? (
              <YStack gap="$3">
                <Paragraph color="$color10">Non hai ancora inviato nessuna richiesta di preventivo.</Paragraph>
                <Link href="/preventivo" style={{ textDecoration: "none" }}>
                  <Text color="$blue10" fontWeight="600">
                    Richiedi il tuo primo preventivo
                  </Text>
                </Link>
              </YStack>
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

          <YStack gap="$5">
            <H1 size="$8">Le mie prenotazioni</H1>
            {bookings === null ? (
              <Text color="$color9">Caricamento...</Text>
            ) : bookings.length === 0 ? (
              <Paragraph color="$color10">Nessuna prenotazione ancora: accetta un preventivo per crearne una.</Paragraph>
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
      await apiClient.updateGuidedRequest(token, request.id, { description: description.trim(), city: city.trim() });
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
    <YStack borderWidth={1} borderColor="$borderColor" borderRadius="$5" padding="$4" gap="$3">
      {isEditing ? (
        <YStack gap="$2">
          <Text fontWeight="700" fontSize="$5">
            {request.categoryLabel}
          </Text>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
          />
          <YStack borderWidth={1} borderColor="$borderColor" borderRadius="$4" backgroundColor="white">
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
          {error ? (
            <Text color="$red10" fontSize="$3">
              {error}
            </Text>
          ) : null}
          <XStack gap="$2">
            <Button size="$3" onPress={handleSaveEdit} disabled={isSaving} opacity={isSaving ? 0.6 : 1}>
              {isSaving ? "Salvataggio..." : "Salva modifiche"}
            </Button>
            <Button size="$3" backgroundColor="$color3" color="$color12" onPress={() => setIsEditing(false)} disabled={isSaving}>
              Annulla
            </Button>
          </XStack>
        </YStack>
      ) : (
        <>
          <YStack flexDirection="row" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap="$2">
            <YStack gap="$1">
              <Text fontWeight="700" fontSize="$5">
                {request.categoryLabel} · {request.city}
              </Text>
              <Text color="$color10">{request.description}</Text>
            </YStack>
            <Text fontSize="$2" color="$blue10" fontWeight="600">
              {STATUS_LABEL[request.status]}
            </Text>
          </YStack>

          {canEdit ? (
            <XStack gap="$2" flexWrap="wrap" alignItems="center">
              <Button size="$2" backgroundColor="$color3" color="$color12" onPress={startEditing}>
                Modifica
              </Button>
              {confirmingDelete ? (
                <>
                  <Text fontSize="$2" color="$red10">
                    Eliminare questa richiesta?
                  </Text>
                  <Button
                    size="$2"
                    backgroundColor="$red10"
                    onPress={handleDelete}
                    disabled={isDeleting}
                    opacity={isDeleting ? 0.6 : 1}
                  >
                    {isDeleting ? "Eliminazione..." : "Conferma"}
                  </Button>
                  <Button size="$2" backgroundColor="$color3" color="$color12" onPress={() => setConfirmingDelete(false)}>
                    Annulla
                  </Button>
                </>
              ) : (
                <Button size="$2" backgroundColor="$color3" color="$red10" onPress={() => setConfirmingDelete(true)}>
                  Elimina
                </Button>
              )}
            </XStack>
          ) : null}
          {error ? (
            <Text color="$red10" fontSize="$3">
              {error}
            </Text>
          ) : null}
        </>
      )}

      {request.sentTo.length > 0 ? (
        <YStack gap="$2" borderTopWidth={1} borderTopColor="$borderColor" paddingTop="$3">
          <H2 size="$4">Inviata a</H2>
          {request.sentTo.map((professional) => (
            <Link
              key={professional.id}
              href={`/professionista/${professional.id}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <XStack
                gap="$3"
                alignItems="center"
                backgroundColor="$color2"
                borderRadius="$4"
                padding="$3"
              >
                <ProfessionalAvatar imageUrl={professional.imageUrl} categorySlug={professional.categorySlug} size={44} />
                <YStack gap="$1" flex={1}>
                  <XStack gap="$2" alignItems="center" flexWrap="wrap">
                    <Text fontWeight="600">{professional.businessName}</Text>
                    {professional.verified ? (
                      <Text fontSize="$1" color="$blue10" fontWeight="600">
                        ✓ Verificato
                      </Text>
                    ) : null}
                  </XStack>
                  <Text color="$color10" fontSize="$3">
                    {professional.categoryLabel} · {professional.city}
                  </Text>
                </YStack>
              </XStack>
            </Link>
          ))}
        </YStack>
      ) : null}

      {request.quotes.length > 0 ? (
        <YStack gap="$2" borderTopWidth={1} borderTopColor="$borderColor" paddingTop="$3">
          <H2 size="$4">Preventivi ricevuti</H2>
          {request.quotes.map((quote) => (
            <YStack key={quote.id} backgroundColor="$color2" borderRadius="$4" padding="$3" gap="$2">
              <Text fontWeight="600">{quote.businessName}</Text>
              <Text color="$color10" fontSize="$3">
                Manodopera: €{(quote.laborEurCents / 100).toFixed(2)} · Materiali: €{(quote.materialsEurCents / 100).toFixed(2)}
              </Text>
              {quote.notes ? (
                <Text color="$color10" fontSize="$3">
                  {quote.notes}
                </Text>
              ) : null}
              {quote.status === "SENT" ? (
                <Button
                  size="$3"
                  alignSelf="flex-start"
                  onPress={() => onAcceptQuote(quote.id)}
                  disabled={acceptingQuoteId === quote.id}
                  opacity={acceptingQuoteId === quote.id ? 0.6 : 1}
                >
                  {acceptingQuoteId === quote.id ? "Conferma..." : "Accetta preventivo"}
                </Button>
              ) : quote.status === "ACCEPTED" ? (
                <Text fontSize="$2" color="$green10" fontWeight="600">
                  Accettato
                </Text>
              ) : null}
            </YStack>
          ))}
        </YStack>
      ) : (
        <Text color="$color9" fontSize="$3">
          Nessun preventivo ricevuto ancora.
        </Text>
      )}
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
    <YStack borderWidth={1} borderColor="$borderColor" borderRadius="$4" padding="$3" gap="$2">
      <YStack flexDirection="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$2">
        <Text fontWeight="600">{booking.businessName}</Text>
        <Text fontSize="$2" color="$blue10" fontWeight="600">
          {BOOKING_STATUS_LABEL[booking.status]}
        </Text>
      </YStack>
      <Text color="$color10" fontSize="$3">
        {new Date(booking.scheduledAt).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" })}
      </Text>

      {booking.status === "COMPLETED" && !booking.hasReview ? (
        showReviewForm ? (
          <YStack gap="$2" paddingTop="$2" borderTopWidth={1} borderTopColor="$borderColor">
            <YStack flexDirection="row" gap="$1">
              {[1, 2, 3, 4, 5].map((value) => (
                <Text
                  key={value}
                  fontSize="$6"
                  cursor="pointer"
                  onPress={() => setRating(value)}
                  accessibilityRole="button"
                  accessibilityLabel={`${value} stelle`}
                >
                  {value <= rating ? "⭐" : "☆"}
                </Text>
              ))}
            </YStack>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Com'è andata? (opzionale)"
              rows={2}
              style={{ padding: 10, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14, fontFamily: "inherit", resize: "vertical" }}
            />

            <YStack gap="$1">
              <Text fontSize="$2" color="$color9">
                Foto del lavoro svolto (opzionale, fino a {MAX_REVIEW_PHOTOS})
              </Text>
              <YStack flexDirection="row" flexWrap="wrap" gap="$2">
                {photoUrls.map((url) => (
                  <YStack
                    key={url}
                    width={64}
                    height={64}
                    borderRadius="$3"
                    overflow="hidden"
                    position="relative"
                    borderWidth={1}
                    borderColor="$borderColor"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    <YStack
                      position="absolute"
                      top={2}
                      right={2}
                      width={18}
                      height={18}
                      borderRadius={9}
                      backgroundColor="rgba(0,0,0,0.6)"
                      alignItems="center"
                      justifyContent="center"
                      cursor="pointer"
                      onPress={() => removePhoto(url)}
                    >
                      <Text color="white" fontSize="$1">
                        ✕
                      </Text>
                    </YStack>
                  </YStack>
                ))}
                {photoUrls.length < MAX_REVIEW_PHOTOS ? (
                  <YStack
                    width={64}
                    height={64}
                    borderRadius="$3"
                    borderWidth={1}
                    borderColor="$borderColor"
                    borderStyle="dashed"
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    opacity={isUploadingPhoto ? 0.6 : 1}
                    onPress={() => !isUploadingPhoto && photoInputRef.current?.click()}
                  >
                    <Text fontSize="$6" color="$color9">
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
                <Text color="$red10" fontSize="$2">
                  {photoError}
                </Text>
              ) : null}
            </YStack>

            {error ? (
              <Text color="$red10" fontSize="$3">
                {error}
              </Text>
            ) : null}
            <Button
              size="$3"
              alignSelf="flex-start"
              onPress={handleSubmitReview}
              disabled={isSubmitting || isUploadingPhoto}
              opacity={isSubmitting || isUploadingPhoto ? 0.6 : 1}
            >
              {isSubmitting ? "Invio..." : "Invia recensione"}
            </Button>
          </YStack>
        ) : (
          <Button size="$3" alignSelf="flex-start" onPress={() => setShowReviewForm(true)}>
            Lascia una recensione
          </Button>
        )
      ) : booking.status === "COMPLETED" && booking.hasReview ? (
        <Text fontSize="$2" color="$green10" fontWeight="600">
          Recensione inviata
        </Text>
      ) : null}
    </YStack>
  );
}
