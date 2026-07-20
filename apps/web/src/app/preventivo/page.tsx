"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ITALIAN_CITIES, PROFESSIONAL_CATEGORIES, isProfessionalCategorySlug, type ProfessionalCategorySlug } from "@professionisti/shared";
import { Autocomplete, Button, H1, Paragraph, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

export default function PreventivoPage() {
  return (
    <Suspense fallback={null}>
      <PreventivoForm />
    </Suspense>
  );
}

function PreventivoForm() {
  const searchParams = useSearchParams();
  const { user, token, isLoading } = useAuth();

  const initialCategory = searchParams.get("categoria");
  const professionalProfileId = searchParams.get("professionista") ?? undefined;

  const [categorySlug, setCategorySlug] = useState<ProfessionalCategorySlug | "">(
    initialCategory && isProfessionalCategorySlug(initialCategory) ? initialCategory : "",
  );
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ matchedProfessionals: number } | null>(null);

  if (isLoading) {
    return null;
  }

  if (!user || !token) {
    const redirect = `/preventivo${initialCategory ? `?categoria=${initialCategory}` : ""}`;
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi per richiedere un preventivo
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
              ? `La tua richiesta è stata inviata a ${result.matchedProfessionals} professionist${result.matchedProfessionals === 1 ? "a" : "i"}. Riceverai i preventivi qui appena disponibili.`
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
        isUrgent: false,
        photoUrls: [],
        professionalProfileId,
      });
      setResult({ matchedProfessionals: response.matchedProfessionals });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={560} gap="$4">
        <YStack gap="$1">
          <H1 size="$8">Richiedi un preventivo gratuito</H1>
          <Paragraph color="$color10">
            Descrivi il lavoro: lo inviamo subito ai professionisti compatibili nella tua zona.
          </Paragraph>
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
          <Text fontWeight="600">Descrivi il lavoro</Text>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Es. Perdita d'acqua sotto il lavandino della cucina, serve un intervento nei prossimi giorni."
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
          <Text fontWeight="600">Città</Text>
          <YStack borderWidth={1} borderColor="$borderColor" borderRadius="$4" backgroundColor="white">
            <Autocomplete
              items={[...ITALIAN_CITIES]}
              getKey={(item) => item}
              getLabel={(item) => item}
              onSelect={setCity}
              value={city}
              onChangeText={setCity}
              placeholder="Es. Roma"
              size="$5"
            />
          </YStack>
        </YStack>

        {error ? (
          <Text color="$red10" fontSize="$3">
            {error}
          </Text>
        ) : null}

        <Button size="$5" onPress={handleSubmit} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
          {isSubmitting ? "Invio in corso..." : "Invia richiesta"}
        </Button>
      </YStack>
    </YStack>
  );
}
