"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, H1, Text, XStack, YStack } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AccountSidebar } from "@/components/AccountSidebar";

const inputStyle = { padding: 10, borderRadius: 8, border: "1px solid #d0d5dd", fontSize: 15, width: "100%" };
const smallInputStyle = { ...inputStyle, width: 76, textAlign: "center" as const };

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <XStack flexDirection="column" $gtSm={{ flexDirection: "row", alignItems: "center" }} gap="$2">
      <YStack width={200} flexShrink={0}>
        <Text fontWeight="700" fontSize="$4">
          {label}
          {required ? " *" : ""}
        </Text>
      </YStack>
      <YStack flex={1} maxWidth={420}>
        {children}
      </YStack>
    </XStack>
  );
}

function parseBirthDate(iso: string | null) {
  if (!iso) return { day: "", month: "", year: "" };
  const parts = iso.slice(0, 10).split("-");
  const year = parts[0] ?? "";
  const month = parts[1] ?? "";
  const day = parts[2] ?? "";
  return { day: day ? String(Number(day)) : "", month: month ? String(Number(month)) : "", year };
}

export default function AccountPage() {
  const router = useRouter();
  const { user, token, isLoading, refreshUser, logout } = useAuth();

  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [birthDay, setBirthDay] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  function syncFieldsFromUser() {
    if (!user) return;
    setName(user.name ?? "");
    setSurname(user.surname ?? "");
    const parsed = parseBirthDate(user.birthDate);
    setBirthDay(parsed.day);
    setBirthMonth(parsed.month);
    setBirthYear(parsed.year);
    setEmail(user.email ?? "");
    setPhone(user.phone ?? "");
  }

  function handleCancelProfile() {
    syncFieldsFromUser();
    setProfileError(null);
    setProfileSaved(false);
  }

  useEffect(() => {
    syncFieldsFromUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    let birthDate: string | undefined;
    if (birthDay || birthMonth || birthYear) {
      const day = Number(birthDay);
      const month = Number(birthMonth);
      const year = Number(birthYear);
      if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) {
        setProfileError("Data di nascita non valida.");
        return;
      }
      birthDate = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    setIsSavingProfile(true);
    try {
      await apiClient.updateAccount(token as string, {
        name: name.trim(),
        surname: surname.trim() || undefined,
        birthDate,
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
      await refreshUser();
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setIsEditingPassword(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSavingPassword(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteError(null);
    if (deleteConfirmText.trim().toUpperCase() !== "ELIMINA") {
      setDeleteError('Scrivi "ELIMINA" per confermare.');
      return;
    }

    setIsDeleting(true);
    try {
      await apiClient.deleteAccount(token as string);
      logout();
      router.push("/");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
      setIsDeleting(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" paddingVertical="$8" paddingHorizontal="$4">
      <XStack width="100%" maxWidth={900} gap="$8" alignItems="flex-start" flexWrap="wrap">
        <AccountSidebar />

        <YStack flex={1} gap="$5" minWidth={280}>
          <YStack gap="$1">
            <H1 size="$8">Impostazioni dell&apos;account</H1>
            <Text fontSize="$2" color="$color9">
              * Campo obbligatorio
            </Text>
          </YStack>

          <YStack gap="$4">
            <FieldRow label="Nome" required>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            </FieldRow>

            <FieldRow label="Cognome" required>
              <input value={surname} onChange={(e) => setSurname(e.target.value)} style={inputStyle} />
            </FieldRow>

            <FieldRow label="Data di nascita" required>
              <XStack gap="$2">
                <input
                  value={birthDay}
                  onChange={(e) => setBirthDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="DD"
                  inputMode="numeric"
                  style={smallInputStyle}
                />
                <input
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  placeholder="MM"
                  inputMode="numeric"
                  style={smallInputStyle}
                />
                <input
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="YYYY"
                  inputMode="numeric"
                  style={{ ...smallInputStyle, width: 96 }}
                />
              </XStack>
            </FieldRow>

            <FieldRow label="Password">
              {isEditingPassword ? (
                <YStack gap="$2" maxWidth={320}>
                  {user.hasPassword ? (
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Password attuale"
                      style={inputStyle}
                    />
                  ) : null}
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nuova password (almeno 8 caratteri)"
                    style={inputStyle}
                  />
                  {passwordError ? (
                    <Text color="$red10" fontSize="$3">
                      {passwordError}
                    </Text>
                  ) : null}
                  <XStack gap="$3">
                    <Button
                      size="$3"
                      onPress={handleChangePassword}
                      disabled={isSavingPassword}
                      opacity={isSavingPassword ? 0.6 : 1}
                    >
                      {isSavingPassword ? "Salvataggio..." : "Salva password"}
                    </Button>
                    <Text
                      color="$color10"
                      fontWeight="600"
                      cursor="pointer"
                      onPress={() => {
                        setIsEditingPassword(false);
                        setPasswordError(null);
                        setCurrentPassword("");
                        setNewPassword("");
                      }}
                    >
                      Annulla
                    </Text>
                  </XStack>
                </YStack>
              ) : (
                <Text color="$blue10" fontWeight="600" cursor="pointer" onPress={() => setIsEditingPassword(true)}>
                  {user.hasPassword ? "Aggiorna password" : "Impostare la password"}
                </Text>
              )}
              {!isEditingPassword && passwordSaved ? (
                <Text color="$green10" fontSize="$3">
                  Password aggiornata!
                </Text>
              ) : null}
            </FieldRow>
          </YStack>

          <YStack height={1} backgroundColor="$borderColor" />

          <YStack gap="$4">
            <FieldRow label="Telefono">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Es. +39 333 1234567"
                style={inputStyle}
              />
            </FieldRow>

            <FieldRow label="Email" required>
              <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            </FieldRow>
          </YStack>

          <YStack height={1} backgroundColor="$borderColor" />

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

          <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$3">
            <XStack gap="$4" alignItems="center">
              <Button size="$4" borderRadius="$10" onPress={handleSaveProfile} disabled={isSavingProfile} opacity={isSavingProfile ? 0.6 : 1}>
                {isSavingProfile ? "Salvataggio..." : "Salva"}
              </Button>
              <Text color="$color10" fontWeight="600" cursor="pointer" onPress={handleCancelProfile}>
                Annulla
              </Text>
            </XStack>

            {!isConfirmingDelete ? (
              <XStack
                gap="$1"
                alignItems="center"
                cursor="pointer"
                onPress={() => setIsConfirmingDelete(true)}
                accessibilityRole="button"
                accessibilityLabel="Elimina il mio account"
              >
                <Trash2 size={15} strokeWidth={1.5} color="#C8362B" />
                <Text color="$red10" fontWeight="600">
                  Elimina il mio account
                </Text>
              </XStack>
            ) : null}
          </XStack>

          {isConfirmingDelete ? (
            <YStack gap="$3" padding="$4" backgroundColor="$red2" borderRadius="$4" borderWidth={1} borderColor="$red6">
              <Text color="$color11" fontSize="$3">
                Questa azione è definitiva: verranno eliminati il tuo profilo, le richieste, le prenotazioni e le
                recensioni collegate al tuo account. Scrivi <Text fontWeight="800">ELIMINA</Text> per confermare.
              </Text>
              <input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="ELIMINA"
                style={{ ...inputStyle, maxWidth: 240 }}
              />
              {deleteError ? (
                <Text color="$red10" fontSize="$3">
                  {deleteError}
                </Text>
              ) : null}
              <XStack gap="$3">
                <Button
                  size="$3"
                  backgroundColor="$red9"
                  color="white"
                  onPress={handleDeleteAccount}
                  disabled={isDeleting}
                  opacity={isDeleting ? 0.6 : 1}
                >
                  {isDeleting ? "Eliminazione..." : "Elimina definitivamente"}
                </Button>
                <Text
                  color="$color10"
                  fontWeight="600"
                  cursor="pointer"
                  onPress={() => {
                    setIsConfirmingDelete(false);
                    setDeleteConfirmText("");
                    setDeleteError(null);
                  }}
                >
                  Annulla
                </Text>
              </XStack>
            </YStack>
          ) : null}
        </YStack>
      </XStack>
    </YStack>
  );
}
