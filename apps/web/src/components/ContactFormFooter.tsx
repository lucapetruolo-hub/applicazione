"use client";

import { useState } from "react";
import type { ContactMessageInput } from "@professionisti/shared";
import { Button, Text, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";

const ROLE_OPTIONS: { value: ContactMessageInput["role"]; label: string }[] = [
  { value: "CLIENT", label: "Sono un cliente" },
  { value: "PROFESSIONAL", label: "Sono un professionista" },
  { value: "OTHER", label: "Altro" },
];

/**
 * Form "Contatti" nel footer, al posto dell'elenco categorie "Servizi"
 * (richiesta esplicita dell'utente, ispirata a un riferimento screenshot):
 * ruolo + email + messaggio, salvato per davvero (nuovo `ContactMessage`,
 * visibile in /admin) — nessun invio email reale (Resend/Twilio restano
 * rimandati, CLAUDE.md §9), ma un canale funzionante, non un form finto.
 * Stesso pattern honeypot/stati di `WaitlistBlock` (ProfessionalsShowcase.tsx).
 */
export function ContactFormFooter() {
  const [role, setRole] = useState<ContactMessageInput["role"]>("CLIENT");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit() {
    if (!email.trim() || !email.includes("@") || !content.trim()) {
      setStatus("error");
      return;
    }
    setStatus("loading");
    try {
      await apiClient.sendContactMessage({ role, email: email.trim(), content: content.trim(), website });
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return (
      <YStack gap="$2" minWidth={220}>
        <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite}>
          Contatti
        </Text>
        <Text fontSize="$3" color={brand.verificato} fontWeight="600">
          Messaggio inviato. Ti risponderemo il prima possibile.
        </Text>
      </YStack>
    );
  }

  const fieldStyle = {
    padding: "8px 10px",
    borderRadius: 8,
    border: `1px solid ${brand.filetto}`,
    fontSize: 13,
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box" as const,
  };

  return (
    <YStack gap="$2" minWidth={220} maxWidth={280}>
      <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite}>
        Contatti
      </Text>
      <select value={role} onChange={(e) => setRole(e.target.value as ContactMessageInput["role"])} style={fieldStyle}>
        {ROLE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }}
      />
      <input
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (status === "error") setStatus("idle");
        }}
        placeholder="La tua email"
        style={fieldStyle}
      />
      <textarea
        value={content}
        onChange={(e) => {
          setContent(e.target.value);
          if (status === "error") setStatus("idle");
        }}
        placeholder="Messaggio"
        rows={3}
        style={{ ...fieldStyle, resize: "vertical", minHeight: 60 }}
      />
      <Button variant="primary" onPress={handleSubmit} disabled={status === "loading"} opacity={status === "loading" ? 0.6 : 1}>
        {status === "loading" ? "Invio..." : "Invia"}
      </Button>
      {status === "error" ? (
        <Text fontSize="$1" color={brand.urgenza}>
          Inserisci un&apos;email valida e un messaggio.
        </Text>
      ) : null}
    </YStack>
  );
}
