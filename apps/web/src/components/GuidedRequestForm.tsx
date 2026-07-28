"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ALL_ITALIAN_CITY_NAMES, PROFESSIONAL_CATEGORIES, isProfessionalCategorySlug, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Autocomplete, Button, H1, Paragraph, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

const MAX_PHOTOS = 3;

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
  const professionalProfileId = searchParams.get("professionista") ?? undefined;

  const [categorySlug, setCategorySlug] = useState<ProfessionalCategorySlug | "">(
    initialCategory && isProfessionalCategorySlug(initialCategory) ? initialCategory : "",
  );
  const selectedCategory = categorySlug ? PROFESSIONAL_CATEGORIES.find((c) => c.slug === categorySlug) : undefined;
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ matchedProfessionals: number } | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Due input distinti invece di uno solo: quello con `capture` apre
  // direttamente la fotocamera sulla maggior parte dei browser mobile
  // (Android/iOS), l'altro apre la galleria/file picker come prima —
  // richiesta esplicita dell'utente di poter scattare una foto al momento
  // invece di dover per forza sceglierne una già esistente.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return null;
  }

  if (!user || !token) {
    const redirect = `${basePath}${initialCategory ? `?categoria=${initialCategory}` : ""}`;
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi per inviare la richiesta
          </H1>
          <Paragraph color="$color10" textAlign="center">
            Serve un account per inviare la richiesta ai professionisti e ricevere le risposte.
          </Paragraph>
          <Link href={`/accedi?redirect=${encodeURIComponent(redirect)}`} style={{ textDecoration: "none" }}>
            <Button size="$5">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (result) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Richiesta inviata!
          </H1>
          <Paragraph color="$color10" textAlign="center">
            {result.matchedProfessionals > 0
              ? `La tua richiesta è stata inviata a ${result.matchedProfessionals} professionist${result.matchedProfessionals === 1 ? "a" : "i"}${isUrgent ? " disponibili ora" : ""}. Riceverai i preventivi qui appena disponibili.`
              : "Al momento non ci sono professionisti disponibili per questa categoria/città, ma la richiesta è stata registrata: te lo faremo sapere appena se ne iscrive uno."}
          </Paragraph>
          <Link href="/le-mie-richieste" style={{ textDecoration: "none" }}>
            <Button size="$5">Vai alle mie richieste</Button>
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

    setIsSubmitting(true);
    try {
      const response = await apiClient.createGuidedRequest(token as string, {
        categorySlug: categorySlug as ProfessionalCategorySlug,
        description: description.trim(),
        city: city.trim(),
        isUrgent,
        photoUrls,
        professionalProfileId,
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
    <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={560} gap="$4">
        <YStack gap="$1">
          <H1 size="$8">{title}</H1>
          <Paragraph color="$color10">{subtitle}</Paragraph>
        </YStack>

        {professionalProfileId && selectedCategory ? (
          // Categoria già determinata dal professionista scelto (si arriva
          // qui dal suo profilo, con categoria e id già nell'URL): non ha
          // senso farla ri-scegliere, è la sua specialità.
          <YStack gap="$2">
            <Text fontWeight="600">Categoria</Text>
            <YStack
              flexDirection="row"
              alignItems="center"
              gap="$2"
              alignSelf="flex-start"
              paddingHorizontal="$3"
              paddingVertical="$2"
              backgroundColor="$blue10"
              borderRadius="$4"
            >
              <Text color="white" fontWeight="600">
                {selectedCategory.icon} {selectedCategory.label}
              </Text>
            </YStack>
          </YStack>
        ) : (
          <YStack gap="$2">
            <Text fontWeight="600">Categoria</Text>
            <YStack flexDirection="row" flexWrap="wrap" gap="$2">
              {PROFESSIONAL_CATEGORIES.map((category) => (
                <Button
                  key={category.slug}
                  size="$3"
                  backgroundColor={categorySlug === category.slug ? "$blue10" : "$color3"}
                  color={categorySlug === category.slug ? "white" : "$color12"}
                  onPress={() => setCategorySlug(category.slug)}
                >
                  {category.icon} {category.label}
                </Button>
              ))}
            </YStack>
          </YStack>
        )}

        <YStack gap="$2">
          <Text fontWeight="600">Descrivi il lavoro</Text>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={descriptionPlaceholder}
            rows={5}
            style={{
              padding: 12,
              borderRadius: 8,
              border: "1px solid #d0d5dd",
              fontSize: 15,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="600">Foto (opzionale, fino a {MAX_PHOTOS})</Text>
          <Text fontSize="$2" color="$color9">
            Una foto aiuta il professionista a capire subito il lavoro e a darti un preventivo più preciso.
          </Text>
          <YStack flexDirection="row" flexWrap="wrap" gap="$2">
            {photoUrls.map((url) => (
              <YStack
                key={url}
                width={88}
                height={88}
                borderRadius="$4"
                overflow="hidden"
                position="relative"
                borderWidth={1}
                borderColor="$borderColor"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <YStack
                  position="absolute"
                  top={4}
                  right={4}
                  width={22}
                  height={22}
                  borderRadius={11}
                  backgroundColor="rgba(0,0,0,0.6)"
                  alignItems="center"
                  justifyContent="center"
                  cursor="pointer"
                  onPress={() => removePhoto(url)}
                >
                  <Text color="white" fontSize="$2">
                    ✕
                  </Text>
                </YStack>
              </YStack>
            ))}
            {photoUrls.length < MAX_PHOTOS ? (
              <>
                <YStack
                  width={88}
                  height={88}
                  borderRadius="$4"
                  borderWidth={1}
                  borderColor="$borderColor"
                  borderStyle="dashed"
                  alignItems="center"
                  justifyContent="center"
                  gap="$1"
                  cursor="pointer"
                  opacity={isUploadingPhoto ? 0.6 : 1}
                  onPress={() => !isUploadingPhoto && cameraInputRef.current?.click()}
                >
                  <Text fontSize="$7" color="$color9">
                    {isUploadingPhoto ? "…" : "📷"}
                  </Text>
                  <Text fontSize="$1" color="$color9">
                    Scatta
                  </Text>
                </YStack>
                <YStack
                  width={88}
                  height={88}
                  borderRadius="$4"
                  borderWidth={1}
                  borderColor="$borderColor"
                  borderStyle="dashed"
                  alignItems="center"
                  justifyContent="center"
                  gap="$1"
                  cursor="pointer"
                  opacity={isUploadingPhoto ? 0.6 : 1}
                  onPress={() => !isUploadingPhoto && galleryInputRef.current?.click()}
                >
                  <Text fontSize="$7" color="$color9">
                    {isUploadingPhoto ? "…" : "🖼️"}
                  </Text>
                  <Text fontSize="$1" color="$color9">
                    Galleria
                  </Text>
                </YStack>
              </>
            ) : null}
          </YStack>
          {/* `capture="environment"` apre direttamente la fotocamera posteriore su Android/iOS invece del
              file picker generico — le foto sono lavori/ambienti, ha senso di default la camera posteriore. */}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
            disabled={isUploadingPhoto}
            style={{ display: "none" }}
          />
          <input
            ref={galleryInputRef}
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

        <YStack gap="$2">
          <Text fontWeight="600">Città</Text>
          <YStack borderWidth={1} borderColor="$borderColor" borderRadius="$4" backgroundColor="white">
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

        {error ? (
          <Text color="$red10" fontSize="$3">
            {error}
          </Text>
        ) : null}

        <Button
          size="$5"
          backgroundColor={isUrgent ? "$red10" : "$blue10"}
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
