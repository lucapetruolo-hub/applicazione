"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import {
  ALL_ITALIAN_CITY_NAMES,
  CATEGORY_DESCRIPTION_EXAMPLES,
  CATEGORY_URGENT_DESCRIPTION_EXAMPLES,
  PROFESSIONAL_CATEGORIES,
  isProfessionalCategorySlug,
  type ProfessionalAgenda,
  type ProfessionalCategorySlug,
} from "@professionisti/shared";
import { Autocomplete, Button, Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { MediaPreview } from "@/components/MediaPreview";

// Foto E video (richiesta esplicita dell'utente), fino a 5 elementi
// (aumentato da 3, stessa richiesta).
const MAX_PHOTOS = 5;

/**
 * Fascia libera dell'agenda pubblica di un professionista, selezionabile
 * qui come data/orario preferito per l'intervento. `remaining` assente per
 * la fascia arrivata bloccata dall'URL (click diretto su una pillola
 * dell'agenda, prima che il fetch dell'agenda completa sia tornato) — solo
 * un'etichetta provvisoria, sostituita dal dato reale appena disponibile.
 */
type PickableAgendaSlot = { date: string; startTime: string; endTime: string; remaining?: number };

/**
 * Ogni fascia libera che offre la modalità scelta (o entrambe le modalità
 * se non ancora scelta) — richiesta esplicita dell'utente: "differenzia
 * sempre se si è partiti con una consulenza online". Nessuna distinzione
 * più tra fasce "esatte" e "generiche": da quando la prenotazione diretta è
 * stata rimossa (CLAUDE.md §20, "ogni fascia apre sempre una richiesta di
 * preventivo") entrambe passano da qui, il backend le rivalida comunque
 * (resolveGenericSlot/resolveFreeExactSlot non escludono più maxBookings=1).
 */
function flattenPickableSlots(agenda: ProfessionalAgenda, mode: "HOME" | "ONLINE" | null): PickableAgendaSlot[] {
  const result: PickableAgendaSlot[] = [];
  for (const day of agenda.days) {
    for (const slot of day.slots) {
      const modeInfo = mode === "ONLINE" ? slot.online : mode === "HOME" ? slot.home : (slot.home ?? slot.online);
      if (modeInfo && modeInfo.bookedCount < modeInfo.maxBookings) {
        result.push({ date: day.date, startTime: slot.startTime, endTime: slot.endTime, remaining: modeInfo.maxBookings - modeInfo.bookedCount });
      }
    }
  }
  return result;
}

function pickableSlotValue(slot: Pick<PickableAgendaSlot, "date" | "startTime" | "endTime">): string {
  return `${slot.date}|${slot.startTime}-${slot.endTime}`;
}

function pickableSlotLabel(slot: PickableAgendaSlot): string {
  const date = new Date(`${slot.date}T00:00:00Z`);
  const dateLabel = date.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
  if (slot.remaining === undefined) return `${dateLabel} · ${slot.startTime}–${slot.endTime}`;
  const seatsLabel = slot.remaining === 1 ? "1 posto libero" : `${slot.remaining} posti liberi`;
  return `${dateLabel} · ${slot.startTime}–${slot.endTime} (${seatsLabel})`;
}

const fieldInputStyle = {
  padding: 12,
  borderRadius: 4,
  border: `1px solid ${brand.filetto}`,
  fontSize: 15,
  fontFamily: "inherit",
  color: brand.grafite,
  width: "100%",
} as const;

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text fontFamily="$body" fontSize={11} fontWeight="700" color={brand.grafite70}>
      {children}
    </Text>
  );
}

export type GuidedRequestFormProps = {
  isUrgent: boolean;
  basePath: string;
  title: string;
  subtitle: string;
  submitLabel: string;
  submittingLabel: string;
  descriptionPlaceholder: string;
};

export function GuidedRequestForm({
  isUrgent,
  basePath,
  title,
  subtitle,
  submitLabel,
  submittingLabel,
  descriptionPlaceholder,
}: GuidedRequestFormProps) {
  const searchParams = useSearchParams();
  const { user, token, isLoading, refreshUser } = useAuth();

  const initialCategory = searchParams.get("categoria");
  const initialCity = searchParams.get("citta") ?? "";
  const professionalProfileId = searchParams.get("professionista") ?? undefined;
  // Valorizzati solo quando si arriva da una fascia "generica" dell'agenda
  // pubblica di un professionista (AvailabilitySlot.maxBookings > 1, vedi
  // packages/shared/src/availability.ts): mostrati come info bloccata sotto,
  // stesso pattern già in uso per la categoria quando si arriva dal profilo
  // di un professionista specifico.
  const preferredDate = searchParams.get("data") ?? undefined;
  const preferredTimeSlot = searchParams.get("fasciaOraria") ?? undefined;
  // Modalità già decisa dal tab attivo sull'agenda pubblica (A domicilio/
  // Online) quando si arriva da una pillola di quella griglia — richiesta
  // esplicita dell'utente: "differenzia sempre se si è partiti con una
  // consulenza online". Solo un prefill (resta modificabile): il backend
  // rivalida comunque che la fascia scelta offra davvero quella modalità.
  const modalitaParam = searchParams.get("modalita");
  const initialServiceMode = modalitaParam === "HOME" || modalitaParam === "ONLINE" ? modalitaParam : null;

  // Quando si arriva dal profilo di un professionista — sia dal bottone
  // generico "Richiedi un preventivo a [nome]" sia dal click diretto su una
  // pillola dell'agenda pubblica — offre sempre la possibilità di scegliere
  // (o cambiare) la data/orario dell'intervento tra quelli realmente liberi
  // nella sua agenda, richiesta esplicita dell'utente: "se si è cliccato
  // direttamente su un orario, inserisci già quell'orario... e dai la
  // possibilità di modificarla sempre in base alle disponibilità aggiunte
  // dal professionista". Nessuna fascia esclusa a priori (esatta o
  // generica, vedi flattenPickableSlots sopra).
  const [pickableSlots, setPickableSlots] = useState<PickableAgendaSlot[]>([]);
  // Inizializzato dalla fascia già bloccata in URL (click su una pillola
  // dell'agenda pubblica), se presente — resta comunque modificabile.
  const [selectedSlotValue, setSelectedSlotValue] = useState(preferredDate && preferredTimeSlot ? `${preferredDate}|${preferredTimeSlot}` : "");
  // Tipo di intervento (richiesta esplicita dell'utente: "in modo che il
  // professionista già sa se può trattarsi di un intervento a domicilio o
  // online") — obbligatorio, stesso principio degli altri campi della
  // richiesta resi obbligatori in un giro precedente (indirizzo, foto).
  // Dichiarato qui (prima dell'effetto sotto, che lo referenzia) invece che
  // vicino agli altri stati del form.
  const [serviceMode, setServiceMode] = useState<"HOME" | "ONLINE" | null>(initialServiceMode);
  // Avviso di conferma prima di inviare senza data/orario, quando ce n'era
  // uno disponibile da scegliere — richiesta esplicita dell'utente.

  useEffect(() => {
    if (!professionalProfileId) return;
    apiClient
      .getProfessionalAgenda(professionalProfileId)
      .then((agenda) => setPickableSlots(flattenPickableSlots(agenda, serviceMode)))
      .catch(() => {});
    // Nessun reset di selectedSlotValue qui: al primo giro deve restare
    // valorizzato dall'URL (se presente); ai cambi successivi di modalità
    // ci pensa già il tasto A domicilio/Online stesso (vedi onPress sotto),
    // un reset anche qui cancellerebbe il prefill dell'URL al primo render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionalProfileId, serviceMode]);

  // Prefill dai dati dell'account (richiesta esplicita dell'utente), una
  // sola volta appena `user` è disponibile: gli useState sopra sono
  // dichiarati prima che `user` sia noto (il componente ritorna null
  // mentre isLoading è vero, ma gli hook restano comunque eseguiti in
  // ordine ad ogni render), quindi il valore iniziale da solo non basta —
  // stesso motivo per cui /account sincronizza i propri campi con un
  // effetto dedicato invece che nell'inizializzatore di useState.
  useEffect(() => {
    if (!user || prefilledFromAccountRef.current) return;
    prefilledFromAccountRef.current = true;
    // I valori arrivati dall'URL (es. "Ripeti la richiesta") hanno la
    // precedenza: l'account riempie solo i campi ancora vuoti.
    setRecipientName((prev) => prev || user.name || "");
    setRecipientSurname((prev) => prev || user.surname || "");
    setRecipientPhone((prev) => prev || user.phone || "");
    setStreet((prev) => prev || user.street || "");
    setHouseNumber((prev) => prev || user.houseNumber || "");
    setAddressExtra((prev) => prev || user.addressExtra || "");
    setPostalCode((prev) => prev || user.postalCode || "");
    setProvince((prev) => prev || user.province || "");
    setCity((prev) => prev || user.city || "");
    // Istantanea dei valori REALI dell'account (non del form, che può
    // ricadere su valori arrivati dall'URL) — confrontata al momento
    // dell'invio per rilevare sia campi mancanti sia campi modificati.
    accountSnapshotRef.current = {
      name: user.name ?? "",
      surname: user.surname ?? "",
      phone: user.phone ?? "",
      street: user.street ?? "",
      houseNumber: user.houseNumber ?? "",
      addressExtra: user.addressExtra ?? "",
      postalCode: user.postalCode ?? "",
      city: user.city ?? "",
      province: user.province ?? "",
    };
  }, [user]);

  // Fascia effettivamente inviata: sempre quella corrente nel selettore
  // (inizializzata dall'URL se si è cliccata una pillola dell'agenda, ma
  // sempre modificabile — vedi selectedSlotValue sopra).
  const [finalPreferredDate, finalPreferredTimeSlot] = selectedSlotValue ? (selectedSlotValue.split("|") as [string, string]) : [undefined, undefined];
  // Elenco mostrato nel selettore: le fasce reali già scaricate, più — solo
  // finché il fetch non è ancora tornato o se per qualche motivo non compare
  // tra quelle scaricate — la fascia arrivata dall'URL, così il selettore
  // mostra sempre la fascia richiesta fin dal primo render invece di un
  // momentaneo "Nessuna preferenza". Bug reale corretto: la fascia dall'URL
  // è legata a `initialServiceMode` (la modalità del tab da cui si è
  // cliccata la pillola in agenda) — mostrarla anche dopo che l'utente ha
  // cambiato modalità la faceva "trapelare" nel selettore dell'altra
  // modalità (es. una fascia A domicilio ancora elencata sotto Online),
  // quindi si applica solo finché `serviceMode` non è stato cambiato
  // rispetto a quello iniziale.
  const urlSlot: PickableAgendaSlot | null =
    preferredDate && preferredTimeSlot && serviceMode === initialServiceMode
      ? { date: preferredDate, startTime: preferredTimeSlot.split("-")[0]!, endTime: preferredTimeSlot.split("-")[1]! }
      : null;
  const displaySlots =
    urlSlot && !pickableSlots.some((s) => pickableSlotValue(s) === pickableSlotValue(urlSlot))
      ? [urlSlot, ...pickableSlots]
      : pickableSlots;

  const [categorySlug, setCategorySlug] = useState<ProfessionalCategorySlug | "">(
    initialCategory && isProfessionalCategorySlug(initialCategory) ? initialCategory : "",
  );
  const selectedCategory = categorySlug ? PROFESSIONAL_CATEGORIES.find((c) => c.slug === categorySlug) : undefined;
  // Esempio del campo "Descrivi il lavoro" specifico per la categoria scelta
  // (richiesta esplicita dell'utente) — prima di scegliere una categoria
  // resta il placeholder generico passato dal chiamante, mai un esempio
  // inventato per una categoria non ancora nota.
  const resolvedDescriptionPlaceholder = categorySlug
    ? (isUrgent ? CATEGORY_URGENT_DESCRIPTION_EXAMPLES : CATEGORY_DESCRIPTION_EXAMPLES)[categorySlug]
    : descriptionPlaceholder;
  // Prefill completo quando si arriva da "Ripeti la richiesta" (pagina
  // Le mie richieste): un lavoro simile al precedente si riparte da qui
  // con descrizione/indirizzo già compilati — restano solo le foto
  // (obbligatorie, e devono essere del problema attuale, non riciclate).
  const [description, setDescription] = useState(searchParams.get("descrizione") ?? "");
  const [city, setCity] = useState(initialCity);
  const [street, setStreet] = useState(searchParams.get("via") ?? "");
  // Destinatario + resto dell'indirizzo strutturato, raccolti fin da qui
  // (richiesta esplicita dell'utente: "voglio che li inserisca subito
  // appena [invia] un preventivo... ma verranno visualizzati al
  // professionista... solo quando si è conclusa la trattativa") — prima
  // raccolti solo alla schermata di accettazione preventivo. Prefillati
  // dall'account (vedi useEffect sotto, "possono essere inserite nella
  // finestra impostazioni dell'account, in modo che quando si richiede un
  // preventivo escano automaticamente compilate già nei campi"), sempre
  // modificabili qui per singola richiesta.
  const [recipientName, setRecipientName] = useState(searchParams.get("nome") ?? "");
  const [recipientSurname, setRecipientSurname] = useState(searchParams.get("cognome") ?? "");
  const [recipientPhone, setRecipientPhone] = useState(searchParams.get("telefono") ?? "");
  const [houseNumber, setHouseNumber] = useState(searchParams.get("civico") ?? "");
  const [addressExtra, setAddressExtra] = useState(searchParams.get("interno") ?? "");
  const [postalCode, setPostalCode] = useState(searchParams.get("cap") ?? "");
  const [province, setProvince] = useState(searchParams.get("provincia") ?? "");
  const prefilledFromAccountRef = useRef(false);
  // Istantanea dei valori reali dell'account al momento del prefill (non i
  // valori di stato, che ricadono su "" per i campi mancanti) — usata al
  // momento dell'invio per capire se il cliente ha modificato o aggiunto
  // qualcosa rispetto a quanto già salvato: richiesta esplicita
  // dell'utente ("se viene cambiato qualche campo rispetto a quelli
  // salvati e precompilati, chiedi se si vogliono salvare i nuovi dati"),
  // che estende il caso già gestito di "l'account non li aveva ancora".
  const accountSnapshotRef = useRef<Record<string, string> | null>(null);
  // True se, al momento dell'invio, almeno un campo differisce da quanto
  // già salvato nell'account (mancante in origine, oppure modificato nel
  // form) — in quel caso si propone di salvare i dati appena inseriti
  // come predefiniti dell'account.
  const [accountDataDiffers, setAccountDataDiffers] = useState(false);
  const [savingDefaults, setSavingDefaults] = useState(false);
  const [defaultsSaved, setDefaultsSaved] = useState(false);
  const [defaultsDeclined, setDefaultsDeclined] = useState(false);
  const [defaultsError, setDefaultsError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ matchedProfessionals: number } | null>(null);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Un solo input file, senza `capture`: su iOS/Android questo fa comparire
  // il menu nativo del sistema ("Scatta foto"/"Libreria foto"/"Scegli file",
  // stile iPhone) invece di aprire direttamente una delle due opzioni —
  // richiesta esplicita dell'utente. Con `capture` impostato il browser
  // salta il menu e apre subito la fotocamera, che è il comportamento che
  // si vuole evitare qui.
  const photoInputRef = useRef<HTMLInputElement>(null);

  if (isLoading) {
    return null;
  }

  if (!user || !token) {
    const redirect = `${basePath}${initialCategory ? `?categoria=${initialCategory}` : ""}`;
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Un ultimo passo: accedi o crea l&apos;account gratuito
          </Text>
          {/* Spiegare il valore PRIMA del muro (psicologia della conversione,
              audit): l'utente deve sapere cosa ottiene in cambio dei 30
              secondi di registrazione, non solo che "serve un account". */}
          <YStack width="100%" gap="$3" backgroundColor={brand.calce} borderRadius="$5" padding="$4" borderWidth={1} borderColor={brand.filetto}>
            <XStack alignItems="center" gap="$3">
              <Icon name="send" size={18} color={brand.cianografia} strokeWidth={1.5} />
              <Text flex={1} fontSize="$3" color={brand.grafite}>
                La tua richiesta arriva subito ai professionisti compatibili della tua zona
              </Text>
            </XStack>
            <XStack alignItems="center" gap="$3">
              <Icon name="badge-check" size={18} color={brand.cianografia} strokeWidth={1.5} />
              <Text flex={1} fontSize="$3" color={brand.grafite}>
                Ricevi e confronti i preventivi in un unico posto, gratis
              </Text>
            </XStack>
            <XStack alignItems="center" gap="$3">
              <Icon name="shield" size={18} color={brand.cianografia} strokeWidth={1.5} />
              <Text flex={1} fontSize="$3" color={brand.grafite}>
                I tuoi contatti restano nascosti finché non accetti un preventivo
              </Text>
            </XStack>
          </YStack>
          <Text color={brand.grafite70} textAlign="center" fontSize="$3">
            Bastano 30 secondi: email o Google, nessuna carta richiesta.
          </Text>
          <XStack gap="$3" flexWrap="wrap" justifyContent="center">
            <Link href={`/accedi?redirect=${encodeURIComponent(redirect)}`} style={{ textDecoration: "none" }}>
              <Button variant="primary">Accedi</Button>
            </Link>
            <Link href={`/registrati?redirect=${encodeURIComponent(redirect)}`} style={{ textDecoration: "none" }}>
              <Button variant="secondary">Crea account gratuito</Button>
            </Link>
          </XStack>
        </YStack>
      </YStack>
    );
  }

  if (result) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            Richiesta inviata!
          </Text>
          <Text color={brand.grafite70} textAlign="center">
            {result.matchedProfessionals > 0
              ? `La tua richiesta è stata inviata a ${result.matchedProfessionals} professionist${result.matchedProfessionals === 1 ? "a" : "i"}${isUrgent ? " disponibili ora" : ""}. Riceverai i preventivi qui appena disponibili.`
              : "Al momento non ci sono professionisti disponibili per questa categoria/città, ma la richiesta è stata registrata: te lo faremo sapere appena se ne iscrive uno."}
          </Text>
          {accountDataDiffers && !defaultsDeclined ? (
            <YStack
              width="100%"
              gap="$2"
              padding="$4"
              backgroundColor={brand.calce}
              borderWidth={1}
              borderColor={brand.filetto}
              borderRadius="$3"
            >
              {defaultsSaved ? (
                <Text color={brand.verificato} fontWeight="600" fontSize="$3">
                  Dati salvati come predefiniti nel tuo account.
                </Text>
              ) : (
                <>
                  <Text fontSize="$3" color={brand.grafite}>
                    Vuoi salvare questi dati (nome, telefono, indirizzo) come predefiniti nel tuo account, così
                    restano aggiornati per la prossima richiesta?
                  </Text>
                  {defaultsError ? (
                    <Text color={brand.urgenza} fontSize="$2">
                      {defaultsError}
                    </Text>
                  ) : null}
                  <XStack gap="$2" flexWrap="wrap">
                    <Button
                      variant="secondary"
                      size="$2"
                      height={36}
                      onPress={handleSaveAsDefaults}
                      disabled={savingDefaults}
                      opacity={savingDefaults ? 0.6 : 1}
                    >
                      {savingDefaults ? "Salvataggio..." : "Sì, salva"}
                    </Button>
                    <Button variant="ghost" size="$2" height={36} onPress={() => setDefaultsDeclined(true)} disabled={savingDefaults}>
                      No, grazie
                    </Button>
                  </XStack>
                </>
              )}
            </YStack>
          ) : null}
          <Link href="/le-mie-richieste" style={{ textDecoration: "none" }}>
            <Button variant="primary">Vai alle mie richieste</Button>
          </Link>
        </YStack>
      </YStack>
    );
  }

  async function handleSaveAsDefaults() {
    if (!token) return;
    setSavingDefaults(true);
    setDefaultsError(null);
    try {
      await apiClient.updateAccount(token, {
        name: recipientName.trim() || undefined,
        surname: recipientSurname.trim() || undefined,
        phone: recipientPhone.trim() || undefined,
        street: street.trim() || undefined,
        houseNumber: houseNumber.trim() || undefined,
        addressExtra: addressExtra.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        city: city.trim() || undefined,
        province: province.trim() || undefined,
      });
      await refreshUser();
      setDefaultsSaved(true);
    } catch (err) {
      setDefaultsError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setSavingDefaults(false);
    }
  }

  async function handleSubmit() {
    setError(null);
    if (!categorySlug) {
      setError("Seleziona una categoria.");
      return;
    }
    if (!serviceMode) {
      setError("Indica se l'intervento è a domicilio o online.");
      return;
    }
    if (description.trim().length < 10) {
      setError("Descrivi il lavoro con almeno 10 caratteri.");
      return;
    }
    // Città (e indirizzo/destinatario) obbligatori solo per un intervento
    // a domicilio (richiesta esplicita dell'utente: "la città poiché si è
    // selezionato online non dev'essere obbligatoria") — per una
    // consulenza online il campo resta facoltativo, nessuna validazione da
    // applicare qui.
    if (serviceMode === "HOME") {
      if (!city.trim()) {
        setError("Indica la città in cui serve l'intervento.");
        return;
      }
      if (!street.trim()) {
        setError("Indica l'indirizzo.");
        return;
      }
      if (!recipientName.trim() || !recipientSurname.trim()) {
        setError("Indica nome e cognome di chi riceverà il professionista.");
        return;
      }
      if (!recipientPhone.trim()) {
        setError("Indica un numero di telefono.");
        return;
      }
      if (!houseNumber.trim()) {
        setError("Indica il numero civico.");
        return;
      }
      if (!postalCode.trim()) {
        setError("Indica il CAP.");
        return;
      }
      if (!province.trim()) {
        setError("Indica la provincia.");
        return;
      }
    }
    if (photoUrls.length === 0) {
      setError("Aggiungi almeno una foto o un video.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await apiClient.createGuidedRequest(token as string, {
        categorySlug: categorySlug as ProfessionalCategorySlug,
        description: description.trim(),
        city: city.trim() || undefined,
        address: street.trim() || undefined,
        recipientName: recipientName.trim() || undefined,
        recipientSurname: recipientSurname.trim() || undefined,
        recipientPhone: recipientPhone.trim() || undefined,
        houseNumber: houseNumber.trim() || undefined,
        addressExtra: addressExtra.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        province: province.trim() || undefined,
        isUrgent,
        serviceMode: serviceMode as "HOME" | "ONLINE",
        photoUrls,
        professionalProfileId,
        preferredDate: finalPreferredDate,
        preferredTimeSlot: finalPreferredTimeSlot,
      });
      // Solo per un intervento a domicilio: i campi destinatario/indirizzo
      // restano vuoti (mai riempiti) per una richiesta Online, confrontarli
      // avrebbe proposto di "salvare" dati vuoti su un account che magari
      // li aveva già — richiesta esplicita dell'utente, ma applicabile solo
      // ai campi realmente compilabili in questo invio.
      if (serviceMode === "HOME") {
        const snapshot = accountSnapshotRef.current;
        const current: Record<string, string> = {
          name: recipientName.trim(),
          surname: recipientSurname.trim(),
          phone: recipientPhone.trim(),
          street: street.trim(),
          houseNumber: houseNumber.trim(),
          addressExtra: addressExtra.trim(),
          postalCode: postalCode.trim(),
          city: city.trim(),
          province: province.trim(),
        };
        const differs = !snapshot || Object.keys(current).some((key) => current[key] !== (snapshot[key] ?? ""));
        setAccountDataDiffers(differs);
      }
      setResult({ matchedProfessionals: response.matchedProfessionals });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setPhotoError(null);
    setIsUploadingPhoto(true);
    try {
      // Cloudinary ridimensiona e comprime lato server (stessa trasformazione
      // dell'immagine profilo professionista): una foto da cellulare può
      // pesare diversi MB, qui viene ridotta prima di finire nel database
      // come URL — richiesta esplicita dell'utente ("ridimensionala per
      // occupare meno memoria").
      const result = await apiClient.uploadGuidedRequestPhoto(token as string, file);
      setPhotoUrls((prev) => [...prev, result.imageUrl].slice(0, MAX_PHOTOS));
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Errore durante il caricamento della foto.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setPhotoUrls((prev) => prev.filter((u) => u !== url));
  }

  return (
    <YStack width="100%" alignItems="center" backgroundColor={brand.gesso} paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={560} gap="$5">
        <YStack gap="$2">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            {title}
          </Text>
          <Text color={brand.grafite70}>{subtitle}</Text>
        </YStack>

        {professionalProfileId && selectedCategory ? (
          // Categoria già determinata dal professionista scelto (si arriva
          // qui dal suo profilo, con categoria e id già nell'URL): non ha
          // senso farla ri-scegliere, è la sua specialità.
          <YStack gap="$2">
            <FieldLabel>Categoria</FieldLabel>
            <XStack
              alignItems="center"
              gap="$2"
              alignSelf="flex-start"
              paddingHorizontal="$3"
              paddingVertical="$2"
              backgroundColor={brand.cianografia}
              borderRadius="$2"
            >
              <Icon name={selectedCategory.icon} size={16} color="white" />
              <Text color="white" fontWeight="600">
                {selectedCategory.label}
              </Text>
            </XStack>
          </YStack>
        ) : (
          <YStack gap="$2">
            <FieldLabel>Categoria</FieldLabel>
            {/* Menu a tendina come scorciatoia alla griglia sotto — stessa
                selezione (categorySlug), utile su schermi piccoli o quando si
                sa già cosa cercare invece di scorrere le caselle — richiesta
                esplicita dell'utente. */}
            <select
              value={categorySlug}
              onChange={(e) => setCategorySlug(e.target.value as ProfessionalCategorySlug | "")}
              style={{
                padding: 12,
                borderRadius: 4,
                border: `1px solid ${brand.filetto}`,
                fontSize: 15,
                fontFamily: "inherit",
                backgroundColor: brand.calce,
                color: brand.grafite,
              }}
            >
              <option value="">Seleziona una categoria...</option>
              {PROFESSIONAL_CATEGORIES.map((category) => (
                <option key={category.slug} value={category.slug}>
                  {category.label}
                </option>
              ))}
            </select>
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
        )}

        <YStack gap="$2">
          <FieldLabel>Tipo di intervento</FieldLabel>
          {/* Resa a interruttore/toggle (richiesta esplicita dell'utente),
              non più due caselle indipendenti: un'unica pista con le due
              opzioni affiancate, quella attiva evidenziata piena — stesso
              principio già in uso per i tab "A domicilio"/"Online" di
              SearchBar (packages/ui), qui applicato inline perché questo
              toggle controlla anche la visibilità del blocco destinatario
              sotto, non solo un filtro di ricerca. */}
          <XStack
            gap="$1"
            padding={4}
            borderRadius="$10"
            backgroundColor={brand.gesso}
            alignSelf="flex-start"
            borderWidth={1}
            borderColor={brand.filetto}
          >
            {(
              [
                { value: "HOME", label: "A domicilio", icon: "house" },
                { value: "ONLINE", label: "Online", icon: "video" },
              ] as const
            ).map((option) => {
              const active = serviceMode === option.value;
              return (
                <XStack
                  key={option.value}
                  alignItems="center"
                  gap="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  borderRadius="$10"
                  backgroundColor={active ? brand.cianografia : "transparent"}
                  cursor="pointer"
                  onPress={() => {
                    setServiceMode(option.value);
                    // Un orario scelto per una modalità può non valere per
                    // l'altra (fasce home/online indipendenti) — richiesta
                    // esplicita dell'utente, "differenzia sempre se si è
                    // partiti con una consulenza online": cambiare modalità
                    // a mano azzera la scelta, il nuovo fetch sotto ripopola
                    // il selettore con le fasce della modalità corretta.
                    setSelectedSlotValue("");
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={option.label}
                >
                  <Icon name={option.icon} size={15} color={active ? "white" : brand.grafite70} />
                  <Text color={active ? "white" : brand.grafite70} fontWeight="600">
                    {option.label}
                  </Text>
                </XStack>
              );
            })}
          </XStack>
        </YStack>

        {professionalProfileId && displaySlots.length > 0 ? (
          <YStack gap="$2">
            <FieldLabel>Data e orario dell&apos;intervento (facoltativo)</FieldLabel>
            <Text fontSize="$2" color={brand.grafite70}>
              {preferredDate && preferredTimeSlot
                ? "Hai scelto questo orario dall'agenda del professionista — puoi cambiarlo qui, sempre tra quelli davvero liberi."
                : "Scegli un orario tra quelli liberi nell'agenda del professionista, oppure lascia senza preferenza."}{" "}
              La richiesta non prenota subito l&apos;orario: il professionista ti risponderà con un preventivo.
            </Text>
            <select
              value={selectedSlotValue}
              onChange={(e) => setSelectedSlotValue(e.target.value)}
              style={{
                padding: 12,
                borderRadius: 4,
                border: `1px solid ${brand.filetto}`,
                fontSize: 15,
                fontFamily: "inherit",
                backgroundColor: brand.calce,
                color: brand.grafite,
              }}
            >
              <option value="">Nessuna preferenza di orario</option>
              {displaySlots.map((slot) => (
                <option key={pickableSlotValue(slot)} value={pickableSlotValue(slot)}>
                  {pickableSlotLabel(slot)}
                </option>
              ))}
            </select>
          </YStack>
        ) : null}

        <YStack gap="$2">
          <FieldLabel>Descrivi il lavoro</FieldLabel>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={resolvedDescriptionPlaceholder}
            rows={5}
            style={{
              padding: 12,
              borderRadius: 4,
              border: `1px solid ${brand.filetto}`,
              fontSize: 15,
              fontFamily: "inherit",
              color: brand.grafite,
              resize: "vertical",
            }}
          />
        </YStack>

        <YStack gap="$2">
          <FieldLabel>Foto o video (fino a {MAX_PHOTOS})</FieldLabel>
          <Text fontSize="$2" color={brand.grafite70}>
            Una foto o un video aiutano il professionista a capire subito il lavoro e a darti un preventivo più preciso.
          </Text>
          <YStack flexDirection="row" flexWrap="wrap" gap="$2">
            {photoUrls.map((url) => (
              <YStack key={url} width={88} height={88} borderRadius="$3" overflow="hidden" position="relative" borderWidth={1} borderColor={brand.filetto}>
                <MediaPreview url={url} />
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
                  onPress={() => removePhoto(url)}
                  accessibilityRole="button"
                  accessibilityLabel="Rimuovi foto"
                >
                  <X size={13} strokeWidth={2} color="white" />
                </YStack>
              </YStack>
            ))}
            {photoUrls.length < MAX_PHOTOS ? (
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
                opacity={isUploadingPhoto ? 0.6 : 1}
                onPress={() => !isUploadingPhoto && photoInputRef.current?.click()}
                accessibilityRole="button"
                accessibilityLabel="Aggiungi foto"
              >
                <Text fontSize="$7" color={brand.grafite70}>
                  {isUploadingPhoto ? "…" : "+"}
                </Text>
                <Text fontSize="$1" color={brand.grafite70}>
                  Aggiungi
                </Text>
              </YStack>
            ) : null}
          </YStack>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*,video/*"
            onChange={handlePhotoChange}
            disabled={isUploadingPhoto}
            style={{ display: "none" }}
          />
          {photoError ? (
            <Text color={brand.urgenza} fontSize="$2">
              {photoError}
            </Text>
          ) : null}
        </YStack>

        <YStack gap="$2">
          <FieldLabel>{serviceMode === "ONLINE" ? "Città (facoltativa)" : "Città"}</FieldLabel>
          <YStack borderWidth={1} borderColor={brand.filetto} borderRadius="$4" backgroundColor={brand.calce}>
            <Autocomplete
              items={ALL_ITALIAN_CITY_NAMES}
              getKey={(item) => item}
              getLabel={(item) => item}
              onSelect={setCity}
              value={city}
              onChangeText={setCity}
              placeholder="Es. Roma"
              size="$5"
              minChars={3}
            />
          </YStack>
          {serviceMode === "ONLINE" ? (
            // Richiesta esplicita dell'utente: "la città poiché si è
            // selezionato online non dev'essere obbligatoria... deve
            // esserci scritto che non è obbligatorio inserire la città, ma
            // se pensi che sia necessario anche un intervento sul posto
            // successivo puoi iniziare la ricerca nella zona
            // dell'intervento" — spiega sia perché il campo è facoltativo
            // sia perché può comunque avere senso compilarlo.
            <Text fontSize="$2" color={brand.grafite70}>
              Per una consulenza online non è obbligatorio indicare la città. Se pensi che in un secondo momento possa
              servire anche un intervento sul posto, indicala comunque: potrai usarla per iniziare la ricerca nella
              zona dell&apos;intervento.
            </Text>
          ) : null}
        </YStack>

        {serviceMode === "HOME" ? (
          <YStack gap="$3">
            <YStack gap="$1">
              <Text fontSize="$2" color={brand.grafite70}>
                I dati di seguito rimarranno nascosti al professionista finché non accetterai un preventivo.
              </Text>
            </YStack>

            <XStack gap="$2" flexWrap="wrap">
              <YStack flex={1} minWidth={160}>
                <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Nome" style={fieldInputStyle} />
              </YStack>
              <YStack flex={1} minWidth={160}>
                <input
                  value={recipientSurname}
                  onChange={(e) => setRecipientSurname(e.target.value)}
                  placeholder="Cognome"
                  style={fieldInputStyle}
                />
              </YStack>
            </XStack>

            <input
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              placeholder="Numero di telefono"
              style={fieldInputStyle}
            />

            <XStack gap="$2" flexWrap="wrap">
              <YStack flex={2} minWidth={200}>
                <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Via/piazza" style={fieldInputStyle} />
              </YStack>
              <YStack flex={1} minWidth={120}>
                <input value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="Numero civico" style={fieldInputStyle} />
              </YStack>
            </XStack>

            <input
              value={addressExtra}
              onChange={(e) => setAddressExtra(e.target.value)}
              placeholder="Scala, piano, interno (facoltativo)"
              style={fieldInputStyle}
            />

            <XStack gap="$2" flexWrap="wrap">
              <YStack flex={1} minWidth={100}>
                <input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="CAP" style={fieldInputStyle} />
              </YStack>
              <YStack flex={1} minWidth={140}>
                <input value={province} onChange={(e) => setProvince(e.target.value)} placeholder="Provincia" style={fieldInputStyle} />
              </YStack>
            </XStack>
          </YStack>
        ) : null}

        {error ? (
          <Text color={brand.urgenza} fontSize="$3">
            {error}
          </Text>
        ) : null}

        <Button
          variant={isUrgent ? "urgent" : "primary"}
          onPress={() => handleSubmit()}
          disabled={isSubmitting || isUploadingPhoto}
          opacity={isSubmitting || isUploadingPhoto ? 0.6 : 1}
        >
          {isSubmitting ? submittingLabel : submitLabel}
        </Button>
      </YStack>
    </YStack>
  );
}
