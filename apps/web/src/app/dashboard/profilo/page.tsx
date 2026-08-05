"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, X } from "lucide-react";
import { PROFESSIONAL_CATEGORIES, POPULAR_SERVICES, ALL_ITALIAN_CITY_NAMES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Autocomplete, Button, Icon, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { ImageCropModal } from "@/components/ImageCropModal";
import { EngagementRadiusSection } from "@/components/EngagementRadiusSection";

const MAX_PORTFOLIO_PHOTOS = 10;

const inputStyle = { padding: 12, borderRadius: 4, border: `1px solid ${brand.filetto}`, fontSize: 15, fontFamily: "inherit", color: brand.grafite };
const smallInputStyle = { ...inputStyle, padding: 10, fontSize: 14 };

function FieldLabel({ children }: { children: string }) {
  return (
    <Text fontFamily="$mono" fontSize={11} fontWeight="500" letterSpacing={0.8} textTransform="uppercase" color={brand.grafite70}>
      {children}
    </Text>
  );
}

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
  // Foto reali di lavori svolti (fino a MAX_PORTFOLIO_PHOTOS), mostrate in
  // una galleria sul profilo pubblico — richiesta esplicita dell'utente:
  // "un'idea dei lavori svolti". Distinte da imageUrl (la foto profilo
  // singola sopra).
  const [portfolioUrls, setPortfolioUrls] = useState<string[]>([]);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPortfolioPhoto, setIsUploadingPortfolioPhoto] = useState(false);
  const [portfolioPhotoError, setPortfolioPhotoError] = useState<string | null>(null);
  const portfolioPhotoInputRef = useRef<HTMLInputElement>(null);
  // Posizione + raggi di ingaggio: sezione a parte (EngagementRadiusSection,
  // proprio bottone "Salva"), non fa parte del form principale sopra. Serve
  // una posizione reale già geocodificata (latitude/longitude diverse da
  // 0,0) per avere senso su una mappa — un professionista che non ha ancora
  // salvato il profilo principale non la vede, coerente con la guardia già
  // in uso per il resto di questa pagina prima che esista un profilo.
  const [engagementLocation, setEngagementLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [engagementRadiusKm, setEngagementRadiusKm] = useState(25);
  const [urgentEngagementRadiusKm, setUrgentEngagementRadiusKm] = useState(25);

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
          setPortfolioUrls(profile.portfolioUrls);
          // 0,0 = comune non ancora geocodificato (stessa convenzione già
          // usata da ResultsMap.tsx): non ha senso mostrare la mappa del
          // raggio di ingaggio centrata sull'oceano davanti all'Africa.
          if (profile.latitude !== 0 || profile.longitude !== 0) {
            setEngagementLocation({ latitude: profile.latitude, longitude: profile.longitude });
          }
          setEngagementRadiusKm(profile.engagementRadiusKm);
          setUrgentEngagementRadiusKm(profile.urgentEngagementRadiusKm);
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
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi come professionista
          </Text>
          <Link href="/accedi?redirect=/dashboard/profilo" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  if (user.role !== "PROFESSIONAL") {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$3" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Questa sezione è per i professionisti
          </Text>
          <Text color={brand.grafite70} textAlign="center">
            Il tuo account è registrato come cliente. Per offrire i tuoi servizi, iscriviti come professionista con
            un&apos;altra email.
          </Text>
          <Link href="/registrati?ruolo=professionista" style={{ textDecoration: "none" }}>
            <Button variant="primary">Iscriviti come professionista</Button>
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
        portfolioUrls,
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

  async function handlePortfolioPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPortfolioPhotoError(null);
    setIsUploadingPortfolioPhoto(true);
    try {
      const result = await apiClient.uploadMyPortfolioPhoto(token as string, file);
      setPortfolioUrls((prev) => [...prev, result.imageUrl].slice(0, MAX_PORTFOLIO_PHOTOS));
    } catch (err) {
      setPortfolioPhotoError(err instanceof Error ? err.message : "Errore durante il caricamento della foto.");
    } finally {
      setIsUploadingPortfolioPhoto(false);
    }
  }

  function removePortfolioPhoto(url: string) {
    setPortfolioUrls((prev) => prev.filter((u) => u !== url));
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4" gap="$5">
      <YStack width="100%" maxWidth={560} gap="$5">
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Il tuo profilo professionista
          </Text>
          <Text color={brand.grafite70}>
            Queste informazioni sono visibili pubblicamente su Professionisti e determinano in quali ricerche
            compari.
          </Text>
        </YStack>

        <YStack gap="$2">
          <FieldLabel>Immagine profilo</FieldLabel>
          <YStack flexDirection="row" alignItems="center" gap="$3">
            <YStack
              width={72}
              height={72}
              borderRadius={36}
              backgroundColor={brand.gesso}
              alignItems="center"
              justifyContent="center"
              overflow="hidden"
              borderWidth={1}
              borderColor={brand.filetto}
            >
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <Camera size={28} strokeWidth={1.5} color={brand.grafite70} />
              )}
            </YStack>
            <YStack gap="$1" flex={1} maxWidth={400} alignItems="flex-start">
              <Button
                variant="secondary"
                size="$3"
                height={40}
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
                <Text color={brand.urgenza} fontSize="$2" flexShrink={1}>
                  {imageError}
                </Text>
              ) : null}
            </YStack>
          </YStack>
        </YStack>

        <YStack gap="$2">
          <FieldLabel>Nome attività</FieldLabel>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Es. Rossi Impianti" style={inputStyle} />
        </YStack>

        <YStack gap="$2">
          <FieldLabel>Categoria</FieldLabel>
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

        <YStack gap="$3">
          <YStack gap="$1">
            <FieldLabel>Posizione</FieldLabel>
            <Text fontSize="$2" color={brand.grafite70}>
              La città è obbligatoria e ti fa trovare nelle ricerche per zona. Se aggiungi anche l&apos;indirizzo
              preciso, il tuo profilo comparirà esattamente lì sulla mappa dei risultati invece che al centro della
              città.
            </Text>
          </YStack>

          <YStack gap="$2">
            <FieldLabel>Città in cui operi</FieldLabel>
            <YStack borderWidth={1} borderColor={brand.filetto} borderRadius="$4" backgroundColor={brand.calce}>
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
            <FieldLabel>Indirizzo preciso (opzionale)</FieldLabel>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Es. Via delle Camelie 38, Latina Scalo"
              style={inputStyle}
            />
            <Text fontSize="$2" color={brand.grafite70}>
              Usato solo per posizionarti con precisione sulla mappa dei risultati: non viene mai mostrato per
              intero nel tuo profilo pubblico o nella tua card.
            </Text>
          </YStack>
        </YStack>

        <YStack
          flexDirection="row"
          alignItems="center"
          gap="$3"
          padding="$3"
          backgroundColor={brand.calce}
          borderWidth={1}
          borderColor={brand.filetto}
          borderRadius="$4"
          cursor="pointer"
          onPress={() => setRemoteAvailable((v) => !v)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: remoteAvailable }}
        >
          <YStack
            width={22}
            height={22}
            borderRadius="$2"
            borderWidth={2}
            borderColor={remoteAvailable ? brand.cianografia : brand.filetto}
            backgroundColor={remoteAvailable ? brand.cianografia : brand.calce}
            alignItems="center"
            justifyContent="center"
          >
            {remoteAvailable ? <Icon name="check" size={14} strokeWidth={2} color="white" /> : null}
          </YStack>
          <YStack flex={1} gap="$1">
            <XStack alignItems="center" gap="$2">
              <Icon name="video" size={16} strokeWidth={1.5} color={brand.grafite} />
              <Text fontWeight="600" color={brand.grafite}>
                Offro anche consulenza online
              </Text>
            </XStack>
            <Text fontSize="$2" color={brand.grafite70}>
              Compari nella ricerca &quot;Online&quot; della home: i clienti possono contattarti da remoto, ovunque si trovino.
            </Text>
          </YStack>
        </YStack>

        <YStack gap="$2">
          <FieldLabel>Prestazioni offerte (opzionale)</FieldLabel>
          <Text fontSize="$2" color={brand.grafite70}>
            Aggiungi i servizi che offri, con un range di prezzo se vuoi indicarlo (es. da 50€ a 100€, utile quando il
            costo varia da caso a caso): comparirà nella tua card nei risultati di ricerca.
          </Text>

          {suggestedServices.length > 0 ? (
            <YStack gap="$1">
              <Text fontSize="$2" color={brand.grafite70}>
                Le più richieste per questa categoria:
              </Text>
              <YStack flexDirection="row" flexWrap="wrap" gap="$2">
                {suggestedServices.map((name) => (
                  <XStack
                    key={name}
                    paddingHorizontal="$3"
                    paddingVertical="$2"
                    borderRadius={999}
                    borderWidth={1}
                    borderColor={brand.cianografia}
                    backgroundColor={brand.cianografiaVelo}
                    cursor="pointer"
                    onPress={() => addSuggestedService(name)}
                    accessibilityRole="button"
                  >
                    <Text color={brand.cianografia} fontWeight="600" fontSize="$3">
                      + {name}
                    </Text>
                  </XStack>
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
                  style={{ ...smallInputStyle, flex: 1, minWidth: 160 }}
                />
                {/* Prezzo e tasto rimuovi raggruppati in un unico blocco senza
                    wrap interno: su schermo stretto (cellulare) l'intero
                    gruppo va a capo insieme sotto al nome, invece di spezzarsi
                    lasciando la "X" isolata su una riga a parte, lontana dalla
                    voce a cui appartiene — bug reale segnalato dall'utente. */}
                <XStack gap="$2" alignItems="center" flexWrap="nowrap">
                  <input
                    value={service.priceMin}
                    onChange={(e) => updateService(index, "priceMin", e.target.value)}
                    placeholder="Da €"
                    inputMode="decimal"
                    style={{ ...smallInputStyle, width: 90 }}
                  />
                  <Text fontSize="$2" color={brand.grafite70}>
                    a
                  </Text>
                  <input
                    value={service.priceMax}
                    onChange={(e) => updateService(index, "priceMax", e.target.value)}
                    placeholder="A €"
                    inputMode="decimal"
                    style={{ ...smallInputStyle, width: 90 }}
                  />
                  <XStack
                    width={36}
                    height={36}
                    flexShrink={0}
                    borderRadius="$2"
                    borderWidth={1}
                    borderColor={brand.urgenza}
                    backgroundColor={brand.urgenzaVelo}
                    alignItems="center"
                    justifyContent="center"
                    cursor="pointer"
                    onPress={() => removeService(index)}
                    accessibilityRole="button"
                    accessibilityLabel="Rimuovi prestazione"
                  >
                    <X size={16} strokeWidth={2} color={brand.urgenza} />
                  </XStack>
                </XStack>
              </YStack>
            ))}
          </YStack>
          <Button variant="ghost" size="$3" height={40} alignSelf="flex-start" onPress={() => setServices((prev) => [...prev, { name: "", priceMin: "", priceMax: "" }])}>
            + Aggiungi prestazione
          </Button>
        </YStack>

        <YStack gap="$2">
          <FieldLabel>{`Foto dei lavori svolti (fino a ${MAX_PORTFOLIO_PHOTOS}, opzionale)`}</FieldLabel>
          <Text fontSize="$2" color={brand.grafite70}>
            Foto reali di lavori completati: aiutano chi apre il tuo profilo a farsi un&apos;idea concreta di cosa
            sai fare.
          </Text>
          <YStack flexDirection="row" flexWrap="wrap" gap="$2">
            {portfolioUrls.map((url) => (
              <YStack key={url} width={88} height={88} borderRadius="$3" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
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
                  onPress={() => removePortfolioPhoto(url)}
                  accessibilityRole="button"
                  accessibilityLabel="Rimuovi foto"
                >
                  <X size={13} strokeWidth={2} color="white" />
                </YStack>
              </YStack>
            ))}
            {portfolioUrls.length < MAX_PORTFOLIO_PHOTOS ? (
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
                opacity={isUploadingPortfolioPhoto ? 0.6 : 1}
                onPress={() => !isUploadingPortfolioPhoto && portfolioPhotoInputRef.current?.click()}
                accessibilityRole="button"
                accessibilityLabel="Aggiungi foto"
              >
                <Text fontSize="$7" color={brand.grafite70}>
                  {isUploadingPortfolioPhoto ? "…" : "+"}
                </Text>
                <Text fontSize="$1" color={brand.grafite70}>
                  Aggiungi
                </Text>
              </YStack>
            ) : null}
          </YStack>
          <input
            ref={portfolioPhotoInputRef}
            type="file"
            accept="image/*"
            onChange={handlePortfolioPhotoChange}
            disabled={isUploadingPortfolioPhoto}
            style={{ display: "none" }}
          />
          {portfolioPhotoError ? (
            <Text color={brand.urgenza} fontSize="$2">
              {portfolioPhotoError}
            </Text>
          ) : null}
        </YStack>

        <YStack gap="$2">
          <FieldLabel>Bio (opzionale)</FieldLabel>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Presenta la tua attività in poche righe."
            rows={4}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </YStack>

        {error ? (
          <Text color={brand.urgenza} fontSize="$3">
            {error}
          </Text>
        ) : null}
        {saved ? (
          <Text color={brand.verificato} fontSize="$3">
            Profilo salvato!
          </Text>
        ) : null}

        <Button variant="primary" onPress={handleSubmit} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
          {isSubmitting ? "Salvataggio..." : "Salva profilo"}
        </Button>
      </YStack>

      {/* Sezione a parte, proprio bottone "Salva": richiede una posizione
          già geocodificata, quindi visibile solo dopo il primo salvataggio
          del profilo principale (città scelta → coordinate reali). */}
      {token && engagementLocation ? (
        <YStack width="100%" maxWidth={560}>
          <EngagementRadiusSection
            token={token}
            latitude={engagementLocation.latitude}
            longitude={engagementLocation.longitude}
            initialEngagementRadiusKm={engagementRadiusKm}
            initialUrgentEngagementRadiusKm={urgentEngagementRadiusKm}
          />
        </YStack>
      ) : null}

      {cropImageSrc ? (
        <ImageCropModal imageSrc={cropImageSrc} onCancel={closeCropModal} onConfirm={handleCropConfirm} />
      ) : null}
    </YStack>
  );
}
