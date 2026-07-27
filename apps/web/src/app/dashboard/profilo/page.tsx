"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PROFESSIONAL_CATEGORIES, POPULAR_SERVICES, ALL_ITALIAN_CITY_NAMES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Autocomplete, Button, H1, Paragraph, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { ImageCropModal } from "@/components/ImageCropModal";

export default function DashboardProfiloPage() {
  const router = useRouter();
  const { user, token, isLoading } = useAuth();

  const [businessName, setBusinessName] = useState("");
  const [categorySlug, setCategorySlug] = useState<ProfessionalCategorySlug | "">("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [bio, setBio] = useState("");
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [services, setServices] = useState<{ name: string; priceMin: string; priceMax: string }[]>([]);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!token) return;
    apiClient
      .getMyProfessionalProfile(token)
      .then((profile) => {
        if (profile) {
          setBusinessName(profile.businessName);
          setCategorySlug(profile.categorySlug as ProfessionalCategorySlug);
          setCity(profile.city);
          setAddress(profile.address ?? "");
          setBio(profile.bio ?? "");
          setRemoteAvailable(profile.remoteAvailable);
          setImageUrl(profile.imageUrl);
          setServices(
            profile.services.map((service) => ({
              name: service.name,
              priceMin: service.priceMinEurCents !== null ? (service.priceMinEurCents / 100).toFixed(2) : "",
              priceMax: service.priceMaxEurCents !== null ? (service.priceMaxEurCents / 100).toFixed(2) : "",
            })),
          );
        }
      })
      .finally(() => setIsLoadingProfile(false));
  }, [token]);

  if (isLoading || (token && isLoadingProfile)) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi come professionista
          </H1>
          <Link href="/accedi?redirect=/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Button size="$5">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (user.role !== "PROFESSIONAL") {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$3" alignItems="center">
          <H1 size="$7" textAlign="center">
            Questa sezione è per i professionisti
          </H1>
          <Paragraph color="$color10" textAlign="center">
            Il tuo account è registrato come cliente. Per offrire i tuoi servizi, iscriviti come professionista con
            un&apos;altra email.
          </Paragraph>
          <Link href="/registrati?ruolo=professionista" style={{ textDecoration: "none" }}>
            <Button size="$5">Iscriviti come professionista</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  async function handleSubmit() {
    setError(null);
    if (!businessName.trim() || businessName.trim().length < 2) {
      setError("Inserisci il nome della tua attività.");
      return;
    }
    if (!categorySlug) {
      setError("Seleziona la tua categoria.");
      return;
    }
    if (!city.trim()) {
      setError("Indica la città in cui operi.");
      return;
    }

    const cleanedServices = services
      .map((service) => ({ name: service.name.trim(), priceMin: service.priceMin.trim(), priceMax: service.priceMax.trim() }))
      .filter((service) => service.name.length > 0);
    for (const service of cleanedServices) {
      if (service.priceMin && Number.isNaN(Number(service.priceMin.replace(",", ".")))) {
        setError(`Prezzo minimo non valido per "${service.name}".`);
        return;
      }
      if (service.priceMax && Number.isNaN(Number(service.priceMax.replace(",", ".")))) {
        setError(`Prezzo massimo non valido per "${service.name}".`);
        return;
      }
      if (service.priceMin && service.priceMax && Number(service.priceMax.replace(",", ".")) < Number(service.priceMin.replace(",", "."))) {
        setError(`Il prezzo massimo deve essere maggiore o uguale al minimo per "${service.name}".`);
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await apiClient.upsertMyProfessionalProfile(token as string, {
        businessName: businessName.trim(),
        categorySlug: categorySlug as ProfessionalCategorySlug,
        city: city.trim(),
        address: address.trim() || undefined,
        subTags: [],
        bio: bio.trim() || undefined,
        remoteAvailable,
        // Se l'immagine è stata caricata prima ancora di salvare il resto
        // del profilo (nessuna riga ancora sul server in quel momento), va
        // inclusa qui nel primo salvataggio vero e proprio — vedi nota in
        // professionals.service.ts#updateMyImage.
        imageUrl: imageUrl ?? undefined,
        services: cleanedServices.map((service) => ({
          name: service.name,
          priceMinEurCents: service.priceMin ? Math.round(Number(service.priceMin.replace(",", ".")) * 100) : undefined,
          priceMaxEurCents: service.priceMax ? Math.round(Number(service.priceMax.replace(",", ".")) * 100) : undefined,
        })),
      });
      setSaved(true);
      setTimeout(() => router.push("/dashboard"), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function updateService(index: number, field: "name" | "priceMin" | "priceMax", value: string) {
    setServices((prev) => prev.map((service, i) => (i === index ? { ...service, [field]: value } : service)));
  }

  function removeService(index: number) {
    setServices((prev) => prev.filter((_, i) => i !== index));
  }

  function addSuggestedService(name: string) {
    setServices((prev) => [...prev, { name, priceMin: "", priceMax: "" }]);
  }

  // Scorciatoia per aggiungere una prestazione senza doverne scrivere il nome
  // da zero: il prezzo (range) resta comunque da compilare a mano — richiesta
  // esplicita dell'utente. Esclude i nomi già aggiunti, confronto case-insensitive.
  const suggestedServices = categorySlug
    ? POPULAR_SERVICES[categorySlug].filter(
        (name) => !services.some((service) => service.name.trim().toLowerCase() === name.toLowerCase()),
      )
    : [];

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImageError(null);
    setCropImageSrc(URL.createObjectURL(file));
  }

  // L'URL blob va revocato solo qui, dal genitore, quando la modale si
  // chiude (annulla o conferma) — non dentro ImageCropModal con un effetto
  // legato al mount/unmount: in dev React StrictMode monta/smonta/rimonta
  // ogni componente una volta per verificarne gli effetti, e questo
  // revocava l'URL subito dopo la sua creazione, rompendo l'anteprima.
  function closeCropModal() {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
  }

  async function handleCropConfirm(blob: Blob) {
    closeCropModal();
    setImageError(null);
    setIsUploadingImage(true);
    try {
      const result = await apiClient.uploadMyProfessionalImage(token as string, blob);
      setImageUrl(result.imageUrl);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Errore durante il caricamento dell'immagine.");
    } finally {
      setIsUploadingImage(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={560} gap="$4">
        <YStack gap="$1">
          <H1 size="$8">Il tuo profilo professionista</H1>
          <Paragraph color="$color10">
            Queste informazioni sono visibili pubblicamente su Professionisti e determinano in quali ricerche
            compari.
          </Paragraph>
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="600">Immagine profilo</Text>
          <YStack flexDirection="row" alignItems="center" gap="$3">
            <YStack
              width={72}
              height={72}
              borderRadius={36}
              backgroundColor="$color3"
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
              borderWidth={1}
              borderColor="$borderColor"
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Text fontSize="$7">📷</Text>
              )}
            </YStack>
            <YStack gap="$1" flex={1} maxWidth={400} alignItems="flex-start">
              <Button
                size="$3"
                disabled={isUploadingImage}
                opacity={isUploadingImage ? 0.6 : 1}
                onPress={() => imageInputRef.current?.click()}
              >
                {isUploadingImage ? "Caricamento..." : imageUrl ? "Cambia immagine" : "Carica immagine"}
              </Button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                disabled={isUploadingImage}
                style={{ display: "none" }}
              />
              {imageError ? (
                <Text color="$red10" fontSize="$2" flexShrink={1}>
                  {imageError}
                </Text>
              ) : null}
            </YStack>
          </YStack>
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="600">Nome attività</Text>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Es. Rossi Impianti"
            style={{ padding: 12, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 15 }}
          />
        </YStack>

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

        <YStack gap="$3">
          <YStack gap="$1">
            <Text fontWeight="600">Posizione</Text>
            <Text fontSize="$2" color="$color9">
              La città è obbligatoria e ti fa trovare nelle ricerche per zona. Se aggiungi anche l&apos;indirizzo
              preciso, il tuo profilo comparirà esattamente lì sulla mappa dei risultati invece che al centro della
              città.
            </Text>
          </YStack>

          <YStack gap="$2">
            <Text fontWeight="600">Città in cui operi</Text>
            <YStack borderWidth={1} borderColor="$borderColor" borderRadius="$4" backgroundColor="white">
              <Autocomplete
                items={ALL_ITALIAN_CITY_NAMES}
                getKey={(item) => item}
                getLabel={(item) => item}
                onSelect={setCity}
                value={city}
                onChangeText={setCity}
                placeholder="Es. Milano"
                size="$5"
                minChars={3}
              />
            </YStack>
          </YStack>

          <YStack gap="$2">
            <Text fontWeight="600">Indirizzo preciso (opzionale)</Text>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Es. Via delle Camelie 38, Latina Scalo"
              style={{ padding: 12, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 15 }}
            />
            <Text fontSize="$2" color="$color9">
              Se hai un negozio o un laboratorio, indica l&apos;indirizzo: comparirà anche nella tua card e nel tuo
              profilo pubblico.
            </Text>
          </YStack>
        </YStack>

        <YStack
          flexDirection="row"
          alignItems="center"
          gap="$3"
          padding="$3"
          backgroundColor="$color2"
          borderRadius="$4"
          cursor="pointer"
          onPress={() => setRemoteAvailable((v) => !v)}
        >
          <YStack
            width={22}
            height={22}
            borderRadius="$2"
            borderWidth={2}
            borderColor={remoteAvailable ? "$blue10" : "$borderColor"}
            backgroundColor={remoteAvailable ? "$blue10" : "white"}
            alignItems="center"
            justifyContent="center"
          >
            {remoteAvailable ? (
              <Text fontSize="$3" color="white" fontWeight="700">
                ✓
              </Text>
            ) : null}
          </YStack>
          <YStack flex={1}>
            <Text fontWeight="600">📹 Offro anche consulenza online</Text>
            <Text fontSize="$2" color="$color10">
              Compari nella ricerca "Online" della home: i clienti possono contattarti da remoto, ovunque si trovino.
            </Text>
          </YStack>
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="600">Prestazioni offerte (opzionale)</Text>
          <Text fontSize="$2" color="$color9">
            Aggiungi i servizi che offri, con un range di prezzo se vuoi indicarlo (es. da 50€ a 100€, utile quando il
            costo varia da caso a caso): comparirà nella tua card nei risultati di ricerca.
          </Text>

          {suggestedServices.length > 0 ? (
            <YStack gap="$1">
              <Text fontSize="$2" color="$color9">
                Le più richieste per questa categoria:
              </Text>
              <YStack flexDirection="row" flexWrap="wrap" gap="$2">
                {suggestedServices.map((name) => (
                  <Button
                    key={name}
                    size="$2"
                    backgroundColor="$blue2"
                    color="$blue11"
                    onPress={() => addSuggestedService(name)}
                  >
                    + {name}
                  </Button>
                ))}
              </YStack>
            </YStack>
          ) : null}

          <YStack gap="$2">
            {services.map((service, index) => (
              <YStack key={index} flexDirection="row" gap="$2" alignItems="center" flexWrap="wrap">
                <input
                  value={service.name}
                  onChange={(e) => updateService(index, "name", e.target.value)}
                  placeholder="Es. Sostituzione caldaia"
                  style={{ flex: 1, minWidth: 160, padding: 10, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14 }}
                />
                <input
                  value={service.priceMin}
                  onChange={(e) => updateService(index, "priceMin", e.target.value)}
                  placeholder="Da €"
                  inputMode="decimal"
                  style={{ width: 90, padding: 10, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14 }}
                />
                <Text fontSize="$2" color="$color9">
                  a
                </Text>
                <input
                  value={service.priceMax}
                  onChange={(e) => updateService(index, "priceMax", e.target.value)}
                  placeholder="A €"
                  inputMode="decimal"
                  style={{ width: 90, padding: 10, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 14 }}
                />
                <Button size="$2" backgroundColor="$color3" color="$color12" onPress={() => removeService(index)}>
                  ✕
                </Button>
              </YStack>
            ))}
          </YStack>
          <Button
            size="$3"
            alignSelf="flex-start"
            backgroundColor="$color3"
            color="$color12"
            onPress={() => setServices((prev) => [...prev, { name: "", priceMin: "", priceMax: "" }])}
          >
            + Aggiungi prestazione
          </Button>
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="600">Bio (opzionale)</Text>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Presenta la tua attività in poche righe."
            rows={4}
            style={{ padding: 12, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 15, fontFamily: "inherit", resize: "vertical" }}
          />
        </YStack>

        {error ? (
          <Text color="$red10" fontSize="$3">
            {error}
          </Text>
        ) : null}
        {saved ? (
          <Text color="$green10" fontSize="$3">
            Profilo salvato!
          </Text>
        ) : null}

        <Button size="$5" onPress={handleSubmit} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
          {isSubmitting ? "Salvataggio..." : "Salva profilo"}
        </Button>
      </YStack>

      {cropImageSrc ? (
        <ImageCropModal imageSrc={cropImageSrc} onCancel={closeCropModal} onConfirm={handleCropConfirm} />
      ) : null}
    </YStack>
  );
}
