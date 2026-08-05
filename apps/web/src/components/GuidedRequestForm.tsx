"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import {
  ALL_ITALIAN_CITY_NAMES,
  PROFESSIONAL_CATEGORIES,
  isProfessionalCategorySlug,
  type ProfessionalAgenda,
  type ProfessionalCategorySlug,
} from "@professionisti/shared";
import { Autocomplete, Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { MediaPreview } from "@/components/MediaPreview";

// Foto E video (richiesta esplicita dell'utente), fino a 5 elementi
// (aumentato da 3, stessa richiesta).
const MAX_PHOTOS = 5;

/** Fascia "generica" (a capienza) dell'agenda pubblica di un professionista, ancora libera — le sole selezionabili qui (le fasce esatte sono prenotazione diretta, un flusso separato). */
type PickableAgendaSlot = { date: string; startTime: string; endTime: string; remaining: number };

function flattenPickableSlots(agenda: ProfessionalAgenda): PickableAgendaSlot[] {
  const result: PickableAgendaSlot[] = [];
  for (const day of agenda.days) {
    for (const slot of day.slots) {
      if (slot.maxBookings > 1 && slot.bookedCount < slot.maxBookings) {
        result.push({ date: day.date, startTime: slot.startTime, endTime: slot.endTime, remaining: slot.maxBookings - slot.bookedCount });
      }
    }
  }
  return result;
}

function pickableSlotValue(slot: PickableAgendaSlot): string {
  return `${slot.date}|${slot.startTime}-${slot.endTime}`;
}

function pickableSlotLabel(slot: PickableAgendaSlot): string {
  const date = new Date(`${slot.date}T00:00:00Z`);
  const dateLabel = date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  const seatsLabel = slot.remaining === 1 ? "1 posto libero" : `${slot.remaining} posti liberi`;
  return `${dateLabel} · ${slot.startTime}–${slot.endTime} (${seatsLabel})`;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text fontFamily="$mono" fontSize={11} fontWeight="500" letterSpacing={0.8} textTransform="uppercase" color={brand.grafite70}>
      {children}
    </Text>
  );
}

export type GuidedRequestFormProps = {
  isUrgent: boolean;
  basePath: string;
  title: string;
  subtitle: string;
  submitLabel: string;
  submittingLabel: string;
  descriptionPlaceholder: string;
};

export function GuidedRequestForm({
  isUrgent,
  basePath,
  title,
  subtitle,
  submitLabel,
  submittingLabel,
  descriptionPlaceholder,
}: GuidedRequestFormProps) {
  const searchParams = useSearchParams();
  const { user, token, isLoading } = useAuth();

  const initialCategory = searchParams.get("categoria");
  const initialCity = searchParams.get("citta") ?? "";
  const professionalProfileId = searchParams.get("professionista") ?? undefined;
  // Valorizzati solo quando si arriva da una fascia "generica" dell'agenda
  // pubblica di un professionista (AvailabilitySlot.maxBookings > 1, vedi
  // packages/shared/src/availability.ts): mostrati come info bloccata sotto,
  // stesso pattern già in uso per la categoria quando si arriva dal profilo
  // di un professionista specifico.
  const preferredDate = searchParams.get("data") ?? undefined;
  const preferredTimeSlot = searchParams.get("fasciaOraria") ?? undefined;

  // Quando si arriva dal profilo di un professionista SENZA una fascia già
  // scelta (bottone generico "Richiedi un preventivo a [nome]", non il
  // click su una singola pillola dell'agenda pubblica), offre comunque la
  // possibilità di indicare un orario preferito tra quelli realmente
  // liberi nella sua agenda — richiesta esplicita dell'utente. Solo le
  // fasce "generiche" (capienza > 1) sono selezionabili qui: le fasce
  // esatte sono prenotazione diretta istantanea, un flusso a parte
  // (bookAgendaSlot) che non passa da una richiesta di preventivo.
  const [pickableSlots, setPickableSlots] = useState<PickableAgendaSlot[]>([]);
  const [selectedSlotValue, setSelectedSlotValue] = useState("");

  useEffect(() => {
    if (!professionalProfileId || preferredDate) return;
    apiClient
      .getProfessionalAgenda(professionalProfileId)
      .then((agenda) => setPickableSlots(flattenPickableSlots(agenda)))
      .catch(() => {});
  }, [professionalProfileId, preferredDate]);

  // Fascia effettivamente inviata: quella bloccata dall'URL ha sempre la
  // precedenza (non è mai in conflitto, il picker sotto non viene mostrato
  // in quel caso), altrimenti quella scelta nel nuovo selettore.
  const [chosenDate, chosenTimeSlot] = selectedSlotValue ? (selectedSlotValue.split("|") as [string, string]) : [undefined, undefined];
  const finalPreferredDate = preferredDate ?? chosenDate;
  const finalPreferredTimeSlot = preferredTimeSlot ?? chosenTimeSlot;

  const [categorySlug, setCategorySlug] = useState<ProfessionalCategorySlug | "">(
    initialCategory && isProfessionalCategorySlug(initialCategory) ? initialCategory : "",
  );
  const selectedCategory = categorySlug ? PROFESSIONAL_CATEGORIES.find((c) => c.slug === categorySlug) : undefined;
  const [description, setDescription] = useState("");
  const [city, setCity] = useState(initialCity);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ matchedProfessionals: number } | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Un solo input file, senza `capture`: su iOS/Android questo fa comparire
  // il menu nativo del sistema ("Scatta foto"/"Libreria foto"/"Scegli file",
  // stile iPhone) invece di aprire direttamente una delle due opzioni —
  // richiesta esplicita dell'utente. Con `capture` impostato il browser
  // salta il menu e apre subito la fotocamera, che è il comportamento che
  // si vuole evitare qui.
  const photoInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return null;
  }

  if (!user || !token) {
    const redirect = `${basePath}${initialCategory ? `?categoria=${initialCategory}` : ""}`;
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi per inviare la richiesta
          </Text>
          <Text color={brand.grafite70} textAlign="center">
            Serve un account per inviare la richiesta ai professionisti e ricevere le risposte.
          </Text>
          <Link href={`/accedi?redirect=${encodeURIComponent(redirect)}`} style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (result) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Richiesta inviata!
          </Text>
          <Text color={brand.grafite70} textAlign="center">
            {result.matchedProfessionals > 0
              ? `La tua richiesta è stata inviata a ${result.matchedProfessionals} professionist${result.matchedProfessionals === 1 ? "a" : "i"}${isUrgent ? " disponibili ora" : ""}. Riceverai i preventivi qui appena disponibili.`
              : "Al momento non ci sono professionisti disponibili per questa categoria/città, ma la richiesta è stata registrata: te lo faremo sapere appena se ne iscrive uno."}
          </Text>
          <Link href="/le-mie-richieste" style={{ textDecoration: "none" }}>
            <Button variant="primary">Vai alle mie richieste</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  async function handleSubmit() {
    setError(null);
    if (!categorySlug) {
      setError("Seleziona una categoria.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Descrivi il lavoro con almeno 10 caratteri.");
      return;
    }
    if (!city.trim()) {
      setError("Indica la città in cui serve l'intervento.");
      return;
    }
    if (!address.trim()) {
      setError("Indica l'indirizzo.");
      return;
    }
    if (photoUrls.length === 0) {
      setError("Aggiungi almeno una foto o un video.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiClient.createGuidedRequest(token as string, {
        categorySlug: categorySlug as ProfessionalCategorySlug,
        description: description.trim(),
        city: city.trim(),
        address: address.trim(),
        isUrgent,
        photoUrls,
        professionalProfileId,
        preferredDate: finalPreferredDate,
        preferredTimeSlot: finalPreferredTimeSlot,
      });
      setResult({ matchedProfessionals: response.matchedProfessionals });
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
      // Cloudinary ridimensiona e comprime lato server (stessa trasformazione
      // dell'immagine profilo professionista): una foto da cellulare può
      // pesare diversi MB, qui viene ridotta prima di finire nel database
      // come URL — richiesta esplicita dell'utente ("ridimensionala per
      // occupare meno memoria").
      const result = await apiClient.uploadGuidedRequestPhoto(token as string, file);
      setPhotoUrls((prev) => [...prev, result.imageUrl].slice(0, MAX_PHOTOS));
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
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={560} gap="$5">
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            {title}
          </Text>
          <Text color={brand.grafite70}>{subtitle}</Text>
        </YStack>

        {professionalProfileId && selectedCategory ? (
          // Categoria già determinata dal professionista scelto (si arriva
          // qui dal suo profilo, con categoria e id già nell'URL): non ha
          // senso farla ri-scegliere, è la sua specialità.
          <YStack gap="$2">
            <FieldLabel>Categoria</FieldLabel>
            <XStack
              alignItems="center"
              gap="$2"
              alignSelf="flex-start"
              paddingHorizontal="$3"
              paddingVertical="$2"
              backgroundColor={brand.cianografia}
              borderRadius="$2"
            >
              <Icon name={selectedCategory.icon} size={16} color="white" />
              <Text color="white" fontWeight="600">
                {selectedCategory.label}
              </Text>
            </XStack>
          </YStack>
        ) : (
          <YStack gap="$2">
            <FieldLabel>Categoria</FieldLabel>
            {/* Menu a tendina come scorciatoia alla griglia sotto — stessa
                selezione (categorySlug), utile su schermi piccoli o quando si
                sa già cosa cercare invece di scorrere le caselle — richiesta
                esplicita dell'utente. */}
            <select
              value={categorySlug}
              onChange={(e) => setCategorySlug(e.target.value as ProfessionalCategorySlug | "")}
              style={{
                padding: 12,
                borderRadius: 4,
                border: `1px solid ${brand.filetto}`,
                fontSize: 15,
                fontFamily: "inherit",
                backgroundColor: brand.calce,
                color: brand.grafite,
              }}
            >
              <option value="">Seleziona una categoria...</option>
              {PROFESSIONAL_CATEGORIES.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.label}
                </option>
              ))}
            </select>
            <YStack flexDirection="row" flexWrap="wrap" gap="$2">
              {PROFESSIONAL_CATEGORIES.map((category) => {
                const active = categorySlug === category.slug;
                return (
                  <XStack
                    key={category.slug}
                    alignItems="center"
                    gap="$2"
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    borderRadius="$2"
                    borderWidth={1}
                    borderColor={active ? brand.cianografia : brand.filetto}
                    backgroundColor={active ? brand.cianografiaVelo : brand.calce}
                    cursor="pointer"
                    onPress={() => setCategorySlug(category.slug)}
                    accessibilityRole="button"
                  >
                    <Icon name={category.icon} size={15} color={active ? brand.cianografia : brand.grafite} />
                    <Text color={active ? brand.cianografia : brand.grafite} fontWeight="600">
                      {category.label}
                    </Text>
                  </XStack>
                );
              })}
            </YStack>
          </YStack>
        )}

        {preferredDate && preferredTimeSlot ? (
          <YStack gap="$2">
            <FieldLabel>Fascia richiesta</FieldLabel>
            <XStack
              alignItems="center"
              gap="$2"
              alignSelf="flex-start"
              paddingHorizontal="$3"
              paddingVertical="$2"
              backgroundColor={brand.calce}
              borderWidth={1}
              borderColor={brand.ottone}
              borderRadius="$2"
            >
              <Icon name="clock" size={16} color={brand.ottone} />
              <Text color={brand.grafite} fontWeight="600">
                {new Date(`${preferredDate}T00:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })}
                {" · "}
                {preferredTimeSlot.replace("-", "–")}
              </Text>
            </XStack>
            <Text fontSize="$2" color={brand.grafite70}>
              Questa è una fascia a capienza limitata: la richiesta non prenota subito l&apos;orario, il professionista ti
              risponderà con un preventivo.
            </Text>
          </YStack>
        ) : null}

        {!preferredDate && professionalProfileId && pickableSlots.length > 0 ? (
          <YStack gap="$2">
            <FieldLabel>Orario preferito (facoltativo)</FieldLabel>
            <Text fontSize="$2" color={brand.grafite70}>
              Scegli un orario tra quelli liberi nell&apos;agenda del professionista, oppure lascia senza preferenza:
              risponderà comunque con un preventivo.
            </Text>
            <select
              value={selectedSlotValue}
              onChange={(e) => setSelectedSlotValue(e.target.value)}
              style={{
                padding: 12,
                borderRadius: 4,
                border: `1px solid ${brand.filetto}`,
                fontSize: 15,
                fontFamily: "inherit",
                backgroundColor: brand.calce,
                color: brand.grafite,
              }}
            >
              <option value="">Nessuna preferenza di orario</option>
              {pickableSlots.map((slot) => (
                <option key={pickableSlotValue(slot)} value={pickableSlotValue(slot)}>
                  {pickableSlotLabel(slot)}
                </option>
              ))}
            </select>
          </YStack>
        ) : null}

        <YStack gap="$2">
          <FieldLabel>Descrivi il lavoro</FieldLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={descriptionPlaceholder}
            rows={5}
            style={{
              padding: 12,
              borderRadius: 4,
              border: `1px solid ${brand.filetto}`,
              fontSize: 15,
              fontFamily: "inherit",
              color: brand.grafite,
              resize: "vertical",
            }}
          />
        </YStack>

        <YStack gap="$2">
          <FieldLabel>Foto o video (fino a {MAX_PHOTOS})</FieldLabel>
          <Text fontSize="$2" color={brand.grafite70}>
            Una foto o un video aiutano il professionista a capire subito il lavoro e a darti un preventivo più preciso.
          </Text>
          <YStack flexDirection="row" flexWrap="wrap" gap="$2">
            {photoUrls.map((url) => (
              <YStack key={url} width={88} height={88} borderRadius="$3" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
                <MediaPreview url={url} />
                <YStack
                  position="absolute"
                  top={4}
                  right={4}
                  width={22}
                  height={22}
                  borderRadius={11}
                  backgroundColor="rgba(20,24,30,0.7)"
                  alignItems="center"
                  justifyContent="center"
                  cursor="pointer"
                  onPress={() => removePhoto(url)}
                  accessibilityRole="button"
                  accessibilityLabel="Rimuovi foto"
                >
                  <X size={13} strokeWidth={2} color="white" />
                </YStack>
              </YStack>
            ))}
            {photoUrls.length < MAX_PHOTOS ? (
              <YStack
                width={88}
                height={88}
                borderRadius="$3"
                borderWidth={1}
                borderColor={brand.filetto}
                borderStyle="dashed"
                alignItems="center"
                justifyContent="center"
                gap="$1"
                cursor="pointer"
                opacity={isUploadingPhoto ? 0.6 : 1}
                onPress={() => !isUploadingPhoto && photoInputRef.current?.click()}
                accessibilityRole="button"
                accessibilityLabel="Aggiungi foto"
              >
                <Text fontSize="$7" color={brand.grafite70}>
                  {isUploadingPhoto ? "…" : "+"}
                </Text>
                <Text fontSize="$1" color={brand.grafite70}>
                  Aggiungi
                </Text>
              </YStack>
            ) : null}
          </YStack>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*,video/*"
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

        <YStack gap="$2">
          <FieldLabel>Città</FieldLabel>
          <YStack borderWidth={1} borderColor={brand.filetto} borderRadius="$4" backgroundColor={brand.calce}>
            <Autocomplete
              items={ALL_ITALIAN_CITY_NAMES}
              getKey={(item) => item}
              getLabel={(item) => item}
              onSelect={setCity}
              value={city}
              onChangeText={setCity}
              placeholder="Es. Roma"
              size="$5"
              minChars={3}
            />
          </YStack>
        </YStack>

        <YStack gap="$2">
          <FieldLabel>Indirizzo</FieldLabel>
          <Text fontSize="$2" color={brand.grafite70}>
            Basta indicare la via, anche senza numero civico: serve solo ad orientare il professionista. Non viene
            mostrato pubblicamente, solo a chi ha in mano la tua richiesta. Se accetterai un preventivo, ti verrà
            chiesto l&apos;indirizzo completo con tutti i dettagli.
          </Text>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Indirizzo"
            style={{
              padding: 12,
              borderRadius: 4,
              border: `1px solid ${brand.filetto}`,
              fontSize: 15,
              fontFamily: "inherit",
              color: brand.grafite,
            }}
          />
        </YStack>

        {error ? (
          <Text color={brand.urgenza} fontSize="$3">
            {error}
          </Text>
        ) : null}

        <Button
          variant={isUrgent ? "urgent" : "primary"}
          onPress={handleSubmit}
          disabled={isSubmitting || isUploadingPhoto}
          opacity={isSubmitting || isUploadingPhoto ? 0.6 : 1}
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </Button>
      </YStack>
    </YStack>
  );
}
