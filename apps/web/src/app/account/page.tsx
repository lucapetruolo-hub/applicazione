"use client";

import { useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Download, Trash2, Eye, EyeOff } from "lucide-react";
import { allItalianCityNames, findComuneByName, isMissingRulesProblem, isPlausiblePhoneNumber, passwordProblem } from "@professionisti/shared";
import { Autocomplete, Avatar, Button, Surface, Text, XStack, YStack, brand } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { ImageCropModal } from "@/components/ImageCropModal";
import { UploadingDots } from "@/components/UploadingDots";
import { AddressAutocompleteInput } from "@/components/AddressAutocompleteInput";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { ADDRESS_NOT_CHOSEN_MESSAGE, useChosenAddress } from "@/lib/useChosenAddress";
import { cleanPostalCode, postalCodeCityProblem, usePostalCodeLookup } from "@/lib/usePostalCodeLookup";
import { SaveBar } from "@/components/SaveBar";
import { ClientEmailVerificationCard } from "@/components/ClientEmailVerificationCard";
import { PASSWORD_RULES_ATTRIBUTE, PasswordMatchHint, PasswordRules } from "@/components/PasswordRules";
import { localPreviewUrl } from "@/lib/media";

const inputStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  border: `1px solid ${brand.bordoCampo}`,
  fontSize: 16,
  fontFamily: "inherit",
  color: brand.grafite,
  width: "100%",
};
const smallInputStyle = { ...inputStyle, width: 76, textAlign: "center" as const };

/** Campo password con "occhio" mostra/nascondi — richiesta esplicita
 * dell'utente, gli input grezzi di questa pagina non ne avevano ancora
 * uno (a differenza di /registrati e /accedi, che lo hanno già). */
function PasswordField({
  value,
  onChange,
  placeholder,
  autoComplete,
  visible,
  onToggleVisible,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input aria-label={placeholder}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        // Generatore di password di iPhone e Mac: solo per la password nuova (§289).
        {...(autoComplete === "new-password" ? { passwordrules: PASSWORD_RULES_ATTRIBUTE } : {})}
        style={{ ...inputStyle, paddingRight: 40 }}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? "Nascondi password" : "Mostra password"}
        style={{
          position: "absolute",
          top: "50%",
          right: 10,
          transform: "translateY(-50%)",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          color: brand.grafite70,
        }}
      >
        {visible ? <EyeOff size={18} strokeWidth={1.5} /> : <Eye size={18} strokeWidth={1.5} />}
      </button>
    </div>
  );
}

// Intestazione di sezione — stesso pattern già in uso in /dashboard/profilo
// (chunking alla Miller, "Verbale Cognitivo" F5.2): una pagina lunga senza
// sezioni percepibili è confusa quanto una pagina disordinata. Applicato
// qui allo stesso identico problema, mai risolto in questa pagina finora.
function SectionTitle({ children }: { children: string }) {
  return (
    <Text fontFamily="$heading" fontWeight="800" fontSize="$5" color={brand.grafite}>
      {children}
    </Text>
  );
}

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <XStack flexDirection="column" $gtSm={{ flexDirection: "row", alignItems: "center" }} gap="$2">
      <YStack width={200} flexShrink={0}>
        <Text fontFamily="$body" fontSize={13} fontWeight="700" color={brand.grafite70}>
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
  const { user, token, isLoading, refreshUser, login, logout } = useAuth();

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
  // Prima la città, poi la via scelta dai suggerimenti di quella città (docs/CHANGELOG.md §214).
  const chosenAddress = useChosenAddress(true);
  // Via scelta senza CAP: lo si cerca da via e civico (docs/CHANGELOG.md §357).
  const [askPostalCode, setAskPostalCode] = useState(false);
  const postalCodeLookup = usePostalCodeLookup({
    enabled: askPostalCode || chosenAddress.serviceDown,
    street,
    houseNumber,
    city: addressCity,
    setPostalCode,
  });
  const cityComune = findComuneByName(addressCity);
  function changeCity(next: string) {
    const changed = next.trim().toLowerCase() !== addressCity.trim().toLowerCase();
    setAddressCity(next);
    if (!changed) return;
    if (street.trim()) {
      setStreet("");
      setHouseNumber("");
      setPostalCode("");
    }
    chosenAddress.setChosen(false);
    const comune = findComuneByName(next);
    if (comune) setProvince(comune.province);
  }
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const [isEditingPassword, setIsEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  // Richiesta esplicita dell'utente: "occhio" per vedere quanto scritto in
  // ognuno dei tre campi, stesso pattern già in uso su /registrati e /accedi.
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPasswordAttempted, setNewPasswordAttempted] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [confirmingLogoutOthers, setConfirmingLogoutOthers] = useState(false);
  const [isLoggingOutOthers, setIsLoggingOutOthers] = useState(false);
  const [logoutOthersDone, setLogoutOthersDone] = useState(false);
  const [logoutOthersError, setLogoutOthersError] = useState<string | null>(null);

  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Esportazione dati personali (richiesta esplicita dell'utente, "Verbale
  // di Conformità" — diritto alla portabilità, art. 20 GDPR).
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
    setCropImageSrc(localPreviewUrl(file));
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

  // Modifiche ai dati del profilo non ancora salvate: la barra "Salva" resta
  // in fondo allo schermo (SaveBar, docs/CHANGELOG.md §349).
  const savedBirth = parseBirthDate(user?.birthDate ?? null);
  const profileDirty =
    Boolean(user) &&
    (name !== (user?.name ?? "") ||
      surname !== (user?.surname ?? "") ||
      birthDay !== savedBirth.day ||
      birthMonth !== savedBirth.month ||
      birthYear !== savedBirth.year ||
      email !== (user?.email ?? "") ||
      phone !== (user?.phone ?? "") ||
      street !== (user?.street ?? "") ||
      houseNumber !== (user?.houseNumber ?? "") ||
      addressExtra !== (user?.addressExtra ?? "") ||
      postalCode !== (user?.postalCode ?? "") ||
      addressCity !== (user?.city ?? "") ||
      province !== (user?.province ?? ""));

  function handleCancelProfile() {
    syncFieldsFromUser();
    setProfileError(null);
    setProfileSaved(false);
  }

  // Campi ricopiati dall'utente ogni volta che cambia (accesso, salvataggio),
  // già durante il render invece che in un effetto dopo.
  const [syncedUser, setSyncedUser] = useState<typeof user>(null);
  if (user !== syncedUser) {
    setSyncedUser(user);
    syncFieldsFromUser();
  }

  if (isLoading) return null;

  if (!user || !token) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
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
    if (phone.trim() && !isPlausiblePhoneNumber(phone)) {
      setProfileError("Controlla il numero di telefono: sembra incompleto o troppo lungo.");
      return;
    }
    if (addressCity.trim() && !cityComune) {
      setProfileError("Scegli la città dall'elenco dei comuni.");
      return;
    }
    if (street.trim() && chosenAddress.missing) {
      setProfileError(ADDRESS_NOT_CHOSEN_MESSAGE);
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
    // CAP scritto a mano: se è di un'altra città lo si dice prima di salvare (§357).
    if (postalCodeLookup.typed) {
      const problem = await postalCodeCityProblem(postalCode, addressCity);
      if (problem) {
        setProfileError(problem);
        return;
      }
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
    // Stesse regole della registrazione (docs/CHANGELOG.md §289).
    const problem = passwordProblem(newPassword, user?.email);
    if (problem) {
      setNewPasswordAttempted(true);
      if (!isMissingRulesProblem(problem)) setPasswordError(problem);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setPasswordError("Le password non coincidono.");
      return;
    }

    setIsSavingPassword(true);
    try {
      const result = await apiClient.changePassword(token as string, {
        currentPassword: currentPassword || undefined,
        newPassword,
      });
      // Il token vecchio non vale più (gli altri dispositivi escono): qui si
      // resta dentro con quello nuovo.
      await login(result.token);
      setPasswordSaved(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setIsEditingPassword(false);
      setNewPasswordAttempted(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSavingPassword(false);
    }
  }

  // Esci dagli altri dispositivi (docs/CHANGELOG.md §294): qui si resta dentro con il token nuovo.
  async function handleLogoutOthers() {
    setLogoutOthersError(null);
    setIsLoggingOutOthers(true);
    try {
      const result = await apiClient.logoutOtherDevices(token as string);
      await login(result.token);
      setConfirmingLogoutOthers(false);
      setLogoutOthersDone(true);
    } catch (err) {
      setLogoutOthersError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsLoggingOutOthers(false);
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

  async function handleExportData() {
    setExportError(null);
    setIsExporting(true);
    try {
      const data = await apiClient.exportMyData(token as string);
      // Download del file direttamente dal browser (questa è l'app reale,
      // non un Artifact: nessuna restrizione sui download avviati da qui).
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `professionisti-dati-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$8" paddingHorizontal="$4">
      {/* Sidebar "Il tuo account" rimossa da questa e dalle altre pagine
          menu (richiesta esplicita dell'utente: "non far vedere quel menu
          sempre lì fisso, così da avere a schermo intero solo il menu
          aperto") — la navigazione tra le voci resta disponibile dal
          menu a tendina dell'header (AccountMenu), che le elenca già
          tutte. */}
      <YStack width="100%" maxWidth={880} gap="$5">
        <YStack gap="$1">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            Impostazioni dell&apos;account
          </Text>
          <Text fontSize={13} color={brand.grafite70}>
            * Campo obbligatorio
          </Text>
        </YStack>

        <ClientEmailVerificationCard />

        {/* Sezione "Profilo" — immagine (solo cliente), nome/cognome/data di
            nascita: spezzata in blocchi Surface percepibili invece
            dell'unico scroll continuo di prima, stesso principio già
            applicato a /dashboard/profilo. */}
        <Surface gap="$4">
          <SectionTitle>Profilo</SectionTitle>

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
                    {isUploadingImage ? (
                      <XStack alignItems="center" gap="$2">
                        <Text color={brand.grafite} fontWeight="600">
                          Caricamento
                        </Text>
                        <UploadingDots dotSize={4} color={brand.grafite} />
                      </XStack>
                    ) : user.imageUrl ? (
                      "Cambia immagine"
                    ) : (
                      "Carica immagine"
                    )}
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
                    <Text color={brand.urgenza} fontSize={13} flexShrink={1}>
                      {imageError}
                    </Text>
                  ) : null}
                </YStack>
              </XStack>
            </FieldRow>
          ) : null}

          <FieldRow label="Nome" required>
            <input aria-label="Nome" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </FieldRow>

          <FieldRow label="Cognome">
            <input aria-label="Cognome" value={surname} onChange={(e) => setSurname(e.target.value)} style={inputStyle} />
          </FieldRow>

          <FieldRow label="Data di nascita">
            <XStack gap="$2">
              <input aria-label="Giorno di nascita"
                value={birthDay}
                onChange={(e) => setBirthDay(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="GG"
                inputMode="numeric"
                style={smallInputStyle}
              />
              <input aria-label="Mese di nascita"
                value={birthMonth}
                onChange={(e) => setBirthMonth(e.target.value.replace(/\D/g, "").slice(0, 2))}
                placeholder="MM"
                inputMode="numeric"
                style={smallInputStyle}
              />
              <input aria-label="Anno di nascita"
                value={birthYear}
                onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="AAAA"
                inputMode="numeric"
                style={{ ...smallInputStyle, width: 96 }}
              />
            </XStack>
          </FieldRow>
        </Surface>

        <Surface gap="$4">
          <SectionTitle>Contatti</SectionTitle>

          <FieldRow label="Email" required>
            <input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
          </FieldRow>

          <FieldRow label="Telefono">
            <PhoneNumberInput value={phone} onChange={setPhone} style={inputStyle} placeholder="Es. 333 1234567" />
          </FieldRow>
        </Surface>

        <Surface gap="$4">
          <SectionTitle>Indirizzo predefinito</SectionTitle>
          <Text fontSize={13} color={brand.grafite70} marginTop={-8}>
            Usato solo per pre-compilare i tuoi dati quando richiedi un preventivo — resta comunque modificabile
            per ogni singola richiesta.
          </Text>

          <FieldRow label="Città">
            {/* Bianco con il bordo degli altri campi (docs/CHANGELOG.md §349): grigio sembrava non modificabile. */}
            <YStack className="guided-city guided-city-inline" borderWidth={1} borderColor={brand.bordoCampo} borderRadius={10} backgroundColor="#ffffff">
              <Autocomplete
                items={allItalianCityNames()}
                getKey={(item) => item}
                getLabel={(item) => item}
                onSelect={changeCity}
                value={addressCity}
                onChangeText={changeCity}
                placeholder="Es. Roma"
                minChars={3}
              />
            </YStack>
          </FieldRow>

          <FieldRow label="Via">
            <YStack gap="$1" width="100%">
              <AddressAutocompleteInput
                value={street}
                onChange={(next) => {
                  setStreet(next);
                  chosenAddress.setChosen(false);
                }}
                onSelect={(selected) => {
                  // Suggerimenti di Google: compila anche gli altri campi (docs/CHANGELOG.md §141, §214),
                  // città compresa: via e città si scrivono insieme (§264).
                  const comune = selected.locality ? findComuneByName(selected.locality) : undefined;
                  if (comune || selected.locality) setAddressCity(comune?.name ?? selected.locality ?? "");
                  setStreet(selected.street ?? selected.address);
                  setHouseNumber(selected.houseNumber ?? "");
                  // Senza CAP non resta quello della via di prima: si cerca da via e civico.
                  setPostalCode(selected.postalCode ?? "");
                  setAskPostalCode(!selected.postalCode);
                  postalCodeLookup.reset();
                  if (selected.province) setProvince(selected.province);
                  chosenAddress.setChosen(true);
                }}
                biasTowards={cityComune ? { latitude: cityComune.lat, longitude: cityComune.lon } : null}
                onServiceUnavailable={chosenAddress.markServiceDown}
                placeholder="Indirizzo, es. Via Roma 5, Bari"
                style={inputStyle}
              />
              {chosenAddress.missing && street.trim() ? (
                <Text fontSize={13} color={brand.grafite70}>
                  Scegli l&apos;indirizzo dall&apos;elenco che compare mentre scrivi.
                </Text>
              ) : null}
            </YStack>
          </FieldRow>

          <FieldRow label="Numero civico">
            <input aria-label="Numero civico" value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="Numero civico" style={{ ...inputStyle, maxWidth: 140 }} />
          </FieldRow>

          <FieldRow label="Scala, piano, interno">
            <input aria-label="Scala, piano, interno"
              value={addressExtra}
              onChange={(e) => setAddressExtra(e.target.value)}
              placeholder="Es. Scala B, piano 3, interno 12"
              style={inputStyle}
            />
          </FieldRow>

          <FieldRow label="CAP">
            <YStack gap="$1" width="100%">
              <input
                aria-label="CAP"
                inputMode="numeric"
                autoComplete="postal-code"
                value={postalCode}
                onChange={(e) => {
                  setPostalCode(cleanPostalCode(e.target.value));
                  postalCodeLookup.onTyped();
                }}
                placeholder="CAP"
                style={{ ...inputStyle, maxWidth: 140 }}
              />
              {postalCodeLookup.found ? (
                <Text fontSize={13} color={brand.grafite70} role="status">
                  CAP trovato in automatico: se non è giusto, cambialo.
                </Text>
              ) : null}
            </YStack>
          </FieldRow>

          <FieldRow label="Provincia">
            <input aria-label="Provincia" value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Es. Milano" style={{ ...inputStyle, maxWidth: 200 }} />
          </FieldRow>
        </Surface>

        <Surface gap="$4">
          <SectionTitle>Accesso e sicurezza</SectionTitle>

          <FieldRow label="Password">
            {isEditingPassword ? (
              <YStack gap="$2" maxWidth={320}>
                {user.hasPassword ? (
                  <PasswordField
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    placeholder="Password attuale"
                    autoComplete="current-password"
                    visible={showCurrentPassword}
                    onToggleVisible={() => setShowCurrentPassword((v) => !v)}
                  />
                ) : null}
                <PasswordField
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="Nuova password"
                  autoComplete="new-password"
                  visible={showNewPassword}
                  onToggleVisible={() => setShowNewPassword((v) => !v)}
                />
                <PasswordRules password={newPassword} showMissing={newPasswordAttempted} />
                <PasswordField
                  value={confirmNewPassword}
                  onChange={setConfirmNewPassword}
                  placeholder="Ripeti la nuova password"
                  autoComplete="new-password"
                  visible={showConfirmNewPassword}
                  onToggleVisible={() => setShowConfirmNewPassword((v) => !v)}
                />
                <PasswordMatchHint password={newPassword} confirmPassword={confirmNewPassword} />
                {passwordError ? (
                  <Text color={brand.urgenza} fontSize={16}>
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
                      setNewPasswordAttempted(false);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmNewPassword("");
                      setShowCurrentPassword(false);
                      setShowNewPassword(false);
                      setShowConfirmNewPassword(false);
                    }}
                  >
                    Annulla
                  </Text>
                </XStack>
              </YStack>
            ) : (
              <Text
                color={brand.cianografiaScuro}
                fontWeight="600"
                cursor="pointer"
                accessibilityRole="button"
                onPress={() => setIsEditingPassword(true)}
              >
                {user.hasPassword ? "Aggiorna password" : "Impostare la password"}
              </Text>
            )}
            {!isEditingPassword && passwordSaved ? (
              <Text color={brand.verificato} fontSize={16}>
                Password aggiornata!
              </Text>
            ) : null}
          </FieldRow>

          <FieldRow label="Dispositivi">
            {confirmingLogoutOthers ? (
              <YStack gap="$2" maxWidth={360}>
                <Text color={brand.grafite} fontSize={16}>
                  Uscirai da telefoni e computer dove hai fatto l'accesso, tranne questo.
                </Text>
                {logoutOthersError ? (
                  <Text color={brand.urgenza} fontSize={16}>
                    {logoutOthersError}
                  </Text>
                ) : null}
                <XStack gap="$3" alignItems="center">
                  <Button
                    variant="secondary"
                    size="$3"
                    height={40}
                    onPress={handleLogoutOthers}
                    disabled={isLoggingOutOthers}
                    opacity={isLoggingOutOthers ? 0.6 : 1}
                  >
                    {isLoggingOutOthers ? "Uscita..." : "Conferma"}
                  </Button>
                  <Text
                    color={brand.grafite70}
                    fontWeight="600"
                    cursor="pointer"
                    accessibilityRole="button"
                    onPress={() => {
                      setConfirmingLogoutOthers(false);
                      setLogoutOthersError(null);
                    }}
                  >
                    Annulla
                  </Text>
                </XStack>
              </YStack>
            ) : (
              <Text
                color={brand.cianografiaScuro}
                fontWeight="600"
                cursor="pointer"
                accessibilityRole="button"
                onPress={() => {
                  setLogoutOthersDone(false);
                  setConfirmingLogoutOthers(true);
                }}
              >
                Esci da tutti gli altri dispositivi
              </Text>
            )}
            {!confirmingLogoutOthers && logoutOthersDone ? (
              <Text color={brand.verificato} fontSize={16}>
                Fatto: gli altri dispositivi sono stati scollegati.
              </Text>
            ) : null}
          </FieldRow>
        </Surface>

        {/* "Zona pericolosa" — separata visivamente (bordo/sfondo neutro,
            testo rosso solo sull'azione distruttiva) dal resto del form:
            esportazione dati e cancellazione account non sono "impostazioni"
            come le altre, meritano di distinguersi a colpo d'occhio invece
            di stare appese in fondo alla stessa lista di FieldRow. */}
        <Surface gap="$4" borderColor={brand.filetto}>
          <SectionTitle>Dati e account</SectionTitle>

          <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$3">
            <YStack gap={2} flex={1} minWidth={200}>
              <Text fontWeight="600" color={brand.grafite}>
                Esporta i tuoi dati
              </Text>
              <Text fontSize={13} color={brand.grafite70}>
                Scarica un file con tutte le informazioni collegate al tuo account.
              </Text>
            </YStack>
            <XStack
              gap="$1"
              alignItems="center"
              cursor={isExporting ? "default" : "pointer"}
              opacity={isExporting ? 0.6 : 1}
              onPress={isExporting ? undefined : handleExportData}
              accessibilityRole="button"
              accessibilityLabel="Esporta i miei dati"
            >
              <Download size={15} strokeWidth={1.5} color={brand.grafite70} />
              <Text color={brand.grafite70} fontWeight="600">
                {isExporting ? "Esportazione..." : "Esporta"}
              </Text>
            </XStack>
          </XStack>
          {exportError ? (
            <Text color={brand.urgenza} fontSize={16}>
              {exportError}
            </Text>
          ) : null}

          <YStack height={1} backgroundColor={brand.filetto} />

          <XStack justifyContent="space-between" alignItems="center" flexWrap="wrap" gap="$3">
            <YStack gap={2} flex={1} minWidth={200}>
              <Text fontWeight="600" color={brand.urgenza}>
                Elimina il mio account
              </Text>
              <Text fontSize={13} color={brand.grafite70}>
                Azione definitiva, non reversibile.
              </Text>
            </YStack>
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
                  Elimina
                </Text>
              </XStack>
            ) : null}
          </XStack>

          {isConfirmingDelete ? (
            <YStack gap="$3" padding="$4" backgroundColor="#FBEAE8" borderRadius="$4" borderWidth={1} borderColor={brand.urgenza}>
              <Text color={brand.grafite} fontSize={16}>
                Questa azione è definitiva: verranno eliminati il tuo profilo, le richieste, le prenotazioni e le
                recensioni collegate al tuo account. Scrivi <Text fontWeight="800">ELIMINA</Text> per confermare.
              </Text>
              <input aria-label="Scrivi ELIMINA per confermare"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="ELIMINA"
                style={{ ...inputStyle, maxWidth: 240 }}
              />
              {deleteError ? (
                <Text color={brand.urgenza} fontSize={16}>
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
        </Surface>

        {/* Salva/Annulla del form profilo (Profilo/Contatti/Indirizzo
            predefinito) spostati in fondo alla pagina — richiesta esplicita
            dell'utente: prima stavano a metà pagina, prima delle sezioni
            "Accesso e sicurezza"/"Dati e account", separati dal resto del
            contenuto della pagina che restava sotto di loro. La password e
            l'eliminazione account hanno già le proprie azioni indipendenti
            più in alto, non toccate da questo spostamento. */}
        {profileError ? (
          <Text color={brand.urgenza} fontSize={16}>
            {profileError}
          </Text>
        ) : null}
        {profileSaved ? (
          <Text color={brand.verificato} fontSize={16}>
            Dati salvati!
          </Text>
        ) : null}

        <SaveBar dirty={profileDirty} saving={isSavingProfile} onSave={handleSaveProfile} onCancel={handleCancelProfile} />
      </YStack>

      {cropImageSrc ? <ImageCropModal imageSrc={cropImageSrc} onCancel={closeCropModal} onConfirm={handleCropConfirm} /> : null}
    </YStack>
  );
}
