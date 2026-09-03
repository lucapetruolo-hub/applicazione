"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Trash2 } from "lucide-react";
import { Avatar, Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { AccountSidebar } from "@/components/AccountSidebar";
import { ImageCropModal } from "@/components/ImageCropModal";

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 15,
  fontFamily: "inherit",
  color: brand.grafite,
  width: "100%",
};
const smallInputStyle = { ...inputStyle, width: 76, textAlign: "center" as const };

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <XStack flexDirection="column" $gtSm={{ flexDirection: "row", alignItems: "center" }} gap="$2">
      <YStack width={200} flexShrink={0}>
        <Text fontFamily="$body" fontSize={12} fontWeight="700" color={brand.grafite70}>
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
  // Indirizzo di default dell'account (richiesta esplicita dell'utente):
  // usato solo per pre-compilare la richiesta di preventivo, mai
  // obbligatorio qui — la richiesta guidata resta comunque modificabile
  // per singola richiesta.
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [addressExtra, setAddressExtra] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [addressCity, setAddressCity] = useState("");
  const [province, setProvince] = useState("");
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

  // Immagine profilo dell'account (richiesta esplicita dell'utente: prima
  // solo i professionisti potevano caricarne una) — stesso pattern di
  // /dashboard/profilo (ImageCropModal + Cloudinary), ma sull'utente invece
  // che sul ProfessionalProfile.
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

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
    setStreet(user.street ?? "");
    setHouseNumber(user.houseNumber ?? "");
    setAddressExtra(user.addressExtra ?? "");
    setPostalCode(user.postalCode ?? "");
    setAddressCity(user.city ?? "");
    setProvince(user.province ?? "");
  }

  function handleImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImageError(null);
    setCropImageSrc(URL.createObjectURL(file));
  }

  // Stesso motivo già documentato in /dashboard/profilo: revocare l'URL blob
  // solo qui, non con un effetto legato al mount/unmount di ImageCropModal
  // (React StrictMode in dev monta/smonta/rimonta ogni componente una
  // volta, rompendo l'anteprima se la revoca fosse lì dentro).
  function closeCropModal() {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
  }

  async function handleCropConfirm(blob: Blob) {
    closeCropModal();
    setImageError(null);
    setIsUploadingImage(true);
    try {
      await apiClient.uploadMyAccountImage(token as string, blob);
      await refreshUser();
    } catch (err) {
      setImageError(err instanceof Error ? err.message : "Errore durante il caricamento dell'immagine.");
    } finally {
      setIsUploadingImage(false);
    }
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
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Accedi per gestire il tuo account
          </Text>
          <Link href="/accedi?redirect=/account" style={{ textDecoration: "none" }}>
            <Button variant="primary">Accedi</Button>
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
        street: street.trim() || undefined,
        houseNumber: houseNumber.trim() || undefined,
        addressExtra: addressExtra.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        city: addressCity.trim() || undefined,
        province: province.trim() || undefined,
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
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$8" paddingHorizontal="$4">
      <XStack width="100%" maxWidth={900} gap="$8" alignItems="flex-start" flexWrap="wrap">
        <AccountSidebar />

        <YStack flex={1} gap="$5" minWidth={280}>
          <YStack gap="$1">
            <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
              Impostazioni dell&apos;account
            </Text>
            <Text fontSize="$2" color={brand.grafite70}>
              * Campo obbligatorio
            </Text>
          </YStack>

          <YStack gap="$4">
            {/*
              Solo per i clienti: un professionista ha già la propria
              immagine profilo (pubblica, ProfessionalProfile.imageUrl) in
              /dashboard/profilo — mostrarla anche qui sarebbe ridondante e
              fuorviante, perché questa (User.imageUrl) non è quella
              mostrata pubblicamente sul profilo/nei risultati di ricerca.
              Richiesta esplicita dell'utente.
            */}
            {!user.isProfessional ? (
              <FieldRow label="Immagine profilo">
                <XStack alignItems="center" gap="$3">
                  <YStack
                    width={72}
                    height={72}
                    borderRadius={36}
                    overflow="hidden"
                    borderWidth={1}
                    borderColor={brand.filetto}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={brand.gesso}
                  >
                    {user.imageUrl ? (
                      <Avatar name={[user.name, user.surname].filter(Boolean).join(" ") || "?"} imageUrl={user.imageUrl} size={72} />
                    ) : (
                      <Camera size={28} strokeWidth={1.5} color={brand.grafite70} />
                    )}
                  </YStack>
                  <YStack gap="$1" flex={1} maxWidth={300} alignItems="flex-start">
                    <Button
                      variant="secondary"
                      size="$2"
                      height={36}
                      disabled={isUploadingImage}
                      opacity={isUploadingImage ? 0.6 : 1}
                      onPress={() => imageInputRef.current?.click()}
                    >
                      {isUploadingImage ? "Caricamento..." : user.imageUrl ? "Cambia immagine" : "Carica immagine"}
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
                </XStack>
              </FieldRow>
            ) : null}

            <FieldRow label="Nome" required>
              <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
            </FieldRow>

            <FieldRow label="Cognome">
              <input value={surname} onChange={(e) => setSurname(e.target.value)} style={inputStyle} />
            </FieldRow>

            <FieldRow label="Data di nascita">
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
                      autoComplete="current-password"
                      style={inputStyle}
                    />
                  ) : null}
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nuova password (almeno 8 caratteri)"
                    autoComplete="new-password"
                    style={inputStyle}
                  />
                  {passwordError ? (
                    <Text color={brand.urgenza} fontSize="$3">
                      {passwordError}
                    </Text>
                  ) : null}
                  <XStack gap="$3" alignItems="center">
                    <Button
                      variant="secondary"
                      size="$3"
                      height={40}
                      onPress={handleChangePassword}
                      disabled={isSavingPassword}
                      opacity={isSavingPassword ? 0.6 : 1}
                    >
                      {isSavingPassword ? "Salvataggio..." : "Salva password"}
                    </Button>
                    <Text
                      color={brand.grafite70}
                      fontWeight="600"
                      cursor="pointer"
                      accessibilityRole="button"
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
                <Text
                  color={brand.cianografia}
                  fontWeight="600"
                  cursor="pointer"
                  accessibilityRole="button"
                  onPress={() => setIsEditingPassword(true)}
                >
                  {user.hasPassword ? "Aggiorna password" : "Impostare la password"}
                </Text>
              )}
              {!isEditingPassword && passwordSaved ? (
                <Text color={brand.verificato} fontSize="$3">
                  Password aggiornata!
                </Text>
              ) : null}
            </FieldRow>
          </YStack>

          <YStack height={1} backgroundColor={brand.filetto} />

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

          <YStack height={1} backgroundColor={brand.filetto} />

          <YStack gap="$4">
            <YStack gap="$1">
              <Text fontFamily="$heading" fontWeight="800" fontSize="$5" color={brand.grafite}>
                Indirizzo
              </Text>
              <Text fontSize="$2" color={brand.grafite70}>
                Usato solo per pre-compilare i tuoi dati quando richiedi un preventivo — resta comunque modificabile
                per ogni singola richiesta.
              </Text>
            </YStack>

            <FieldRow label="Via">
              <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Via/piazza" style={inputStyle} />
            </FieldRow>

            <FieldRow label="Numero civico">
              <input value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="Numero civico" style={{ ...inputStyle, maxWidth: 140 }} />
            </FieldRow>

            <FieldRow label="Scala, piano, interno">
              <input
                value={addressExtra}
                onChange={(e) => setAddressExtra(e.target.value)}
                placeholder="Es. Scala B, piano 3, interno 12"
                style={inputStyle}
              />
            </FieldRow>

            <FieldRow label="CAP">
              <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="CAP" style={{ ...inputStyle, maxWidth: 140 }} />
            </FieldRow>

            <FieldRow label="Città">
              <input value={addressCity} onChange={(e) => setAddressCity(e.target.value)} placeholder="Città" style={inputStyle} />
            </FieldRow>

            <FieldRow label="Provincia">
              <input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Es. Milano" style={{ ...inputStyle, maxWidth: 200 }} />
            </FieldRow>
          </YStack>

          <YStack height={1} backgroundColor={brand.filetto} />

          {profileError ? (
            <Text color={brand.urgenza} fontSize="$3">
              {profileError}
            </Text>
          ) : null}
          {profileSaved ? (
            <Text color={brand.verificato} fontSize="$3">
              Dati salvati!
            </Text>
          ) : null}

          <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$3">
            <XStack gap="$4" alignItems="center">
              <Button variant="primary" size="$4" onPress={handleSaveProfile} disabled={isSavingProfile} opacity={isSavingProfile ? 0.6 : 1}>
                {isSavingProfile ? "Salvataggio..." : "Salva"}
              </Button>
              <Text color={brand.grafite70} fontWeight="600" cursor="pointer" accessibilityRole="button" onPress={handleCancelProfile}>
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
                <Trash2 size={15} strokeWidth={1.5} color={brand.urgenza} />
                <Text color={brand.urgenza} fontWeight="600">
                  Elimina il mio account
                </Text>
              </XStack>
            ) : null}
          </XStack>

          {isConfirmingDelete ? (
            <YStack gap="$3" padding="$4" backgroundColor="#FBEAE8" borderRadius="$4" borderWidth={1} borderColor={brand.urgenza}>
              <Text color={brand.grafite} fontSize="$3">
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
                <Text color={brand.urgenza} fontSize="$3">
                  {deleteError}
                </Text>
              ) : null}
              <XStack gap="$3" alignItems="center">
                <Button
                  variant="urgent"
                  size="$3"
                  height={40}
                  onPress={handleDeleteAccount}
                  disabled={isDeleting}
                  opacity={isDeleting ? 0.6 : 1}
                >
                  {isDeleting ? "Eliminazione..." : "Elimina definitivamente"}
                </Button>
                <Text
                  color={brand.grafite70}
                  fontWeight="600"
                  cursor="pointer"
                  accessibilityRole="button"
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

      {cropImageSrc ? <ImageCropModal imageSrc={cropImageSrc} onCancel={closeCropModal} onConfirm={handleCropConfirm} /> : null}
    </YStack>
  );
}
