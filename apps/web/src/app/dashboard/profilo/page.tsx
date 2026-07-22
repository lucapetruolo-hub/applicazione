"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PROFESSIONAL_CATEGORIES, ALL_ITALIAN_CITY_NAMES, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Autocomplete, Button, H1, Paragraph, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

export default function DashboardProfiloPage() {
  const router = useRouter();
  const { user, token, isLoading } = useAuth();

  const [businessName, setBusinessName] = useState("");
  const [categorySlug, setCategorySlug] = useState<ProfessionalCategorySlug | "">("");
  const [city, setCity] = useState("");
  const [bio, setBio] = useState("");
  const [remoteAvailable, setRemoteAvailable] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!token) return;
    apiClient
      .getMyProfessionalProfile(token)
      .then((profile) => {
        if (profile) {
          setBusinessName(profile.businessName);
          setCategorySlug(profile.categorySlug as ProfessionalCategorySlug);
          setCity(profile.city);
          setBio(profile.bio ?? "");
          setRemoteAvailable(profile.remoteAvailable);
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

    setIsSubmitting(true);
    try {
      await apiClient.upsertMyProfessionalProfile(token as string, {
        businessName: businessName.trim(),
        categorySlug: categorySlug as ProfessionalCategorySlug,
        city: city.trim(),
        subTags: [],
        bio: bio.trim() || undefined,
        remoteAvailable,
      });
      setSaved(true);
      setTimeout(() => router.push("/dashboard"), 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
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
    </YStack>
  );
}
