"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, H1, H2, Text, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";

export default function AccountPage() {
  const { user, token, isLoading, refreshUser } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
      setPhone(user.phone ?? "");
    }
  }, [user]);

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <H1 size="$7" textAlign="center">
            Accedi per gestire il tuo account
          </H1>
          <Link href="/accedi?redirect=/account" style={{ textDecoration: "none" }}>
            <Button size="$5">Accedi</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  async function handleSaveProfile() {
    setProfileError(null);
    setProfileSaved(false);
    if (name.trim().length < 2) {
      setProfileError("Il nome deve avere almeno 2 caratteri.");
      return;
    }
    if (!email.trim()) {
      setProfileError("L'email è obbligatoria.");
      return;
    }

    setIsSavingProfile(true);
    try {
      await apiClient.updateAccount(token as string, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
      await refreshUser();
      setProfileSaved(true);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError(null);
    setPasswordSaved(false);
    if (newPassword.length < 8) {
      setPasswordError("La nuova password deve avere almeno 8 caratteri.");
      return;
    }

    setIsSavingPassword(true);
    try {
      await apiClient.changePassword(token as string, {
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={560} gap="$7">
        <H1 size="$8">Impostazioni dell&apos;account</H1>

        <YStack gap="$3">
          <H2 size="$6">Dati personali</H2>

          <YStack gap="$2">
            <Text fontWeight="600">Nome</Text>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Il tuo nome"
              style={{ padding: 12, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 15 }}
            />
          </YStack>

          <YStack gap="$2">
            <Text fontWeight="600">Email</Text>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="la-tua-email@esempio.it"
              style={{ padding: 12, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 15 }}
            />
          </YStack>

          <YStack gap="$2">
            <Text fontWeight="600">Telefono (opzionale)</Text>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Es. +39 333 1234567"
              style={{ padding: 12, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 15 }}
            />
          </YStack>

          {profileError ? (
            <Text color="$red10" fontSize="$3">
              {profileError}
            </Text>
          ) : null}
          {profileSaved ? (
            <Text color="$green10" fontSize="$3">
              Dati salvati!
            </Text>
          ) : null}

          <Button size="$5" alignSelf="flex-start" onPress={handleSaveProfile} disabled={isSavingProfile} opacity={isSavingProfile ? 0.6 : 1}>
            {isSavingProfile ? "Salvataggio..." : "Salva"}
          </Button>
        </YStack>

        <YStack gap="$3" borderTopWidth={1} borderTopColor="$borderColor" paddingTop="$6">
          <H2 size="$6">Password</H2>
          <Text color="$color10" fontSize="$3">
            {user.email
              ? "Lascia vuota la password attuale se hai creato l'account con Google e non ne hai ancora impostata una."
              : ""}
          </Text>

          <YStack gap="$2">
            <Text fontWeight="600">Password attuale</Text>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Password attuale (se presente)"
              style={{ padding: 12, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 15 }}
            />
          </YStack>

          <YStack gap="$2">
            <Text fontWeight="600">Nuova password</Text>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Almeno 8 caratteri"
              style={{ padding: 12, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 15 }}
            />
          </YStack>

          {passwordError ? (
            <Text color="$red10" fontSize="$3">
              {passwordError}
            </Text>
          ) : null}
          {passwordSaved ? (
            <Text color="$green10" fontSize="$3">
              Password aggiornata!
            </Text>
          ) : null}

          <Button
            size="$5"
            alignSelf="flex-start"
            onPress={handleChangePassword}
            disabled={isSavingPassword}
            opacity={isSavingPassword ? 0.6 : 1}
          >
            {isSavingPassword ? "Salvataggio..." : "Aggiorna password"}
          </Button>
        </YStack>
      </YStack>
    </YStack>
  );
}
