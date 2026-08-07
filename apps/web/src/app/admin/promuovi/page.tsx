"use client";

import { useState } from "react";
import { Button, H1, Paragraph, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

// Pagina di bootstrap per il PRIMO admin: nessun controllo di login qui
// (sarebbe un problema dell'uovo e della gallina — per vedere /admin serve
// già essere ADMIN). La protezione è il segreto (ADMIN_BOOTSTRAP_SECRET,
// solo variabile d'ambiente su apps/api) verificato lato server. Nessun link
// in UI, solo URL diretto, stesso pattern di /admin.
export default function AdminPromuoviPage() {
  const [email, setEmail] = useState("");
  const [secret, setSecret] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ email: string; role: string } | null>(null);

  async function handleSubmit() {
    setError(null);
    setResult(null);
    if (!email.trim() || !secret.trim()) {
      setError("Compila email e codice.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiClient.adminBootstrapPromote(email.trim(), secret.trim());
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={420} gap="$4">
        <YStack gap="$1">
          <H1 size="$7">Promuovi ad admin</H1>
          <Paragraph color={brand.grafite70}>
            Inserisci l&apos;email dell&apos;account da promuovere e il codice configurato in
            <Text fontWeight="600"> ADMIN_BOOTSTRAP_SECRET</Text> su Railway.
          </Paragraph>
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="600">Email</Text>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tuo@esempio.it"
            type="email"
            style={{ padding: 12, borderRadius: 16, border: `1px solid ${brand.filetto}`, fontSize: 15 }}
          />
        </YStack>

        <YStack gap="$2">
          <Text fontWeight="600">Codice</Text>
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="ADMIN_BOOTSTRAP_SECRET"
            type="password"
            style={{ padding: 12, borderRadius: 16, border: `1px solid ${brand.filetto}`, fontSize: 15 }}
          />
        </YStack>

        {error ? (
          <Text color={brand.urgenza} fontSize="$3">
            {error}
          </Text>
        ) : null}
        {result ? (
          <Text color={brand.verificato} fontSize="$3">
            {result.email} è ora {result.role}. Puoi accedere e aprire /admin.
          </Text>
        ) : null}

        <Button size="$5" onPress={handleSubmit} disabled={isSubmitting} opacity={isSubmitting ? 0.6 : 1}>
          {isSubmitting ? "Attendi..." : "Promuovi"}
        </Button>
      </YStack>
    </YStack>
  );
}
