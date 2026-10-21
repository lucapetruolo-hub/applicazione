"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { X } from "lucide-react";
import {
  ALL_ITALIAN_CITY_NAMES,
  CATEGORY_DESCRIPTION_EXAMPLES,
  CATEGORY_URGENT_DESCRIPTION_EXAMPLES,
  MAX_REQUEST_CATEGORIES,
  PROFESSIONAL_CATEGORIES,
  findComuneByName,
  isPlausiblePhoneNumber,
  isProfessionalCategorySlug,
  normalizePhoneNumber,
  type ProfessionalAgenda,
  type ProfessionalCategorySlug,
  type ProfessionalDetail,
} from "@professionisti/shared";
import { Autocomplete, Button, ButtonArrow, Icon, Text, XStack, YStack, brand, radiusDoc } from "@professionisti/ui";
import { apiClient } from "@/lib/apiClient";
import { useAuth } from "@/lib/AuthContext";
import { MediaPreview } from "@/components/MediaPreview";
import { InlineAuthGate } from "@/components/InlineAuthGate";
import { ProfessionalAvatar } from "@/components/ProfessionalAvatar";
import { UploadingDots } from "@/components/UploadingDots";
import { CategoryTiles } from "@/components/CategoryTiles";
import { AddressAutocompleteInput } from "@/components/AddressAutocompleteInput";
import { PhoneNumberInput } from "@/components/PhoneNumberInput";
import { ADDRESS_NOT_CHOSEN_MESSAGE, useChosenAddress } from "@/lib/useChosenAddress";

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
  border: `1px solid ${brand.bordoCampo}`,
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
  isUrgent: isUrgentInitial,
  title,
  subtitle,
  submitLabel,
  submittingLabel,
  descriptionPlaceholder,
}: GuidedRequestFormProps) {
  const searchParams = useSearchParams();
  const { user, token, isLoading, refreshUser } = useAuth();
  // Urgenza scelta anche da qui, non solo arrivando da /urgente
  // (docs/CHANGELOG.md §154): interruttore "È urgente?" al passo 1.
  const [isUrgent, setIsUrgent] = useState(isUrgentInitial);
  // Modulo in 3 passi (docs/CHANGELOG.md §154): il lavoro, dove, riepilogo.
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Richiesta diretta: inoltrarla ad altri se il professionista non
  // risponde in tempo (decisione dell'utente: attiva di default).
  const [forwardIfNoReply, setForwardIfNoReply] = useState(true);

  const initialCategory = searchParams.get("categoria");
  const initialCity = searchParams.get("citta") ?? "";
  const professionalProfileId = searchParams.get("professionista") ?? undefined;
  // Nome/foto del professionista scelto (richiesta esplicita dell'utente:
  // "il cliente deve capire" che la richiesta va a quello specifico
  // professionista, non genericamente "ai professionisti compatibili nella
  // zona") — passati via query string da chi costruisce il link (profilo
  // pubblico, agenda nei risultati di ricerca), nessun fetch aggiuntivo qui.
  // Nomi dei parametri distinti da "nome"/"cognome" (già usati più sotto per
  // il nome DEL CLIENTE, prefill di "Ripeti la richiesta") — bug reale
  // scoperto in verifica visiva: con la stessa chiave "nome", il nome del
  // professionista finiva scritto nel campo "Nome" del destinatario.
  // `fotoProfessionista` può essere una stringa vuota (professionista senza
  // immagine): trattata come assente, non come URL vuoto passato a
  // ProfessionalAvatar.
  const professionalName = searchParams.get("nomeProfessionista") || undefined;
  const professionalImageUrl = searchParams.get("fotoProfessionista") || null;
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
  // "A domicilio" preselezionato quando l'URL non impone già una modalità
  // (richiesta esplicita dell'utente, "Verbale Cognitivo" F2.4: un default
  // ben scelto non toglie controllo — resta comunque modificabile — ma
  // rimuove una micro-decisione non necessaria essendo l'opzione più
  // frequente).
  const modalitaParam = searchParams.get("modalita");
  const initialServiceMode: "HOME" | "ONLINE" = modalitaParam === "HOME" || modalitaParam === "ONLINE" ? modalitaParam : "HOME";

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
  // online") — obbligatorio (a differenza della foto/video, non più
  // obbligatoria: richiesta esplicita dell'utente di rimuovere quel
  // vincolo su tutte le richieste di preventivo, vedi validazione sotto e
  // `guidedRequestSchema.photoUrls`). Dichiarato qui (prima dell'effetto
  // sotto, che lo referenzia) invece che vicino agli altri stati del form.
  const [serviceMode, setServiceMode] = useState<"HOME" | "ONLINE">(initialServiceMode);
  // Avviso di conferma prima di inviare senza data/orario, quando ce n'era
  // uno disponibile da scegliere — richiesta esplicita dell'utente.

  // Richieste generali chiuse per tutto il sito o per questa categoria in
  // questa città (docs/CHANGELOG.md §211): il cliente sceglie un
  // professionista dalla ricerca. Il server lo rifiuterebbe comunque.
  const [generalClosed, setGeneralClosed] = useState<"GLOBAL" | "ZONE" | null>(null);
  useEffect(() => {
    if (professionalProfileId) return;
    apiClient
      .generalRequestAvailability()
      .then((a) => setGeneralClosed(a.open ? null : a.closedScope))
      .catch(() => {});
  }, [professionalProfileId]);

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
    // Indirizzo già salvato nell'account: vale come scelto, finché non si cambia via o città.
    if (user.street) {
      setAddressVerified(true);
      const line = [user.street, user.houseNumber].filter(Boolean).join(" ");
      const place = [user.postalCode, user.city].filter(Boolean).join(" ");
      setAddressText((prev) => prev || [line, place].filter(Boolean).join(", "));
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Più categorie insieme in una richiesta generale (docs/CHANGELOG.md
  // §259): all'invio diventa una richiesta per categoria. La prima scelta
  // guida l'esempio della descrizione.
  const [categorySlugs, setCategorySlugs] = useState<ProfessionalCategorySlug[]>(
    initialCategory && isProfessionalCategorySlug(initialCategory) ? [initialCategory] : [],
  );
  const categorySlug: ProfessionalCategorySlug | "" = categorySlugs[0] ?? "";
  const selectedCategories = categorySlugs
    .map((slug) => PROFESSIONAL_CATEGORIES.find((c) => c.slug === slug))
    .filter((c): c is (typeof PROFESSIONAL_CATEGORIES)[number] => Boolean(c));
  const selectedCategory = selectedCategories[0];
  function toggleCategory(slug: ProfessionalCategorySlug) {
    setCategorySlugs((current) =>
      current.includes(slug) ? current.filter((s) => s !== slug) : current.length < MAX_REQUEST_CATEGORIES ? [...current, slug] : current,
    );
  }
  // Categoria per cui le richieste generali sono chiuse in questa città (§211).
  const [closedCategorySlug, setClosedCategorySlug] = useState<ProfessionalCategorySlug | null>(null);

  // Dati del professionista scelto caricati dal suo id (docs/CHANGELOG.md
  // §154): prima dipendevano dai parametri del link (nome, foto,
  // categoria) e con il solo id la pagina tornava generica. I parametri
  // restano come valore iniziale, finché la risposta non arriva.
  const [professional, setProfessional] = useState<ProfessionalDetail | null>(null);
  useEffect(() => {
    if (!professionalProfileId) return;
    apiClient
      .getProfessional(professionalProfileId)
      .then((detail) => {
        setProfessional(detail);
        // Con più categorie (docs/CHANGELOG.md §217) resta quella del link
        // se è una delle sue, altrimenti la principale.
        setCategorySlugs(([current]) => [
          current && detail.categories?.some((category) => category.slug === current) ? current : detail.categorySlug,
        ]);
      })
      .catch(() => undefined);
  }, [professionalProfileId]);
  const shownProfessionalName = professional?.businessName ?? professionalName;
  const shownProfessionalImage = professional?.imageUrl ?? professionalImageUrl;
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
  // Cambiando città o categoria l'avviso di zona si ricontrolla al passo successivo.
  useEffect(() => {
    setGeneralClosed((current) => (current === "ZONE" ? null : current));
    setClosedCategorySlug(null);
  }, [city, categorySlugs]);
  // Facoltativa solo per una consulenza online a un professionista scelto (§210).
  const cityOptional = serviceMode === "ONLINE" && Boolean(professionalProfileId);
  const [street, setStreet] = useState(searchParams.get("via") ?? "");
  // Indirizzo scelto dai suggerimenti di Google (docs/CHANGELOG.md §214,
  // richiesta esplicita dell'utente: "farti selezionare per forza una
  // scelta così da non mettere un indirizzo a caso"). Quello arrivato da
  // "Ripeti la richiesta" o dall'account vale come già scelto. Se Google
  // non risponde si accetta il testo libero, per non bloccare la richiesta.
  const chosenAddress = useChosenAddress(Boolean(searchParams.get("via")));
  const setAddressVerified = chosenAddress.setChosen;
  const cityComune = findComuneByName(city);
  /** Cambiando città l'indirizzo già scritto non vale più: si svuota insieme a civico, CAP e provincia. */
  function changeCity(next: string) {
    if (next.trim().toLowerCase() === city.trim().toLowerCase()) {
      setCity(next);
      return;
    }
    setCity(next);
    if (street.trim()) {
      setStreet("");
      setHouseNumber("");
      setPostalCode("");
      setProvince("");
    }
    setAddressVerified(false);
    const comune = findComuneByName(next);
    if (comune) setProvince(comune.province);
  }
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
  // A domicilio un solo campo "Indirizzo" con via e città insieme (richiesta
  // dell'utente, docs/CHANGELOG.md §264): la scelta compila città, civico, CAP
  // e provincia. Il testo mostrato nel campo è l'indirizzo intero.
  const [addressText, setAddressText] = useState(() => {
    const line = [searchParams.get("via"), searchParams.get("civico")].filter(Boolean).join(" ");
    const place = [searchParams.get("cap"), initialCity].filter(Boolean).join(" ");
    return line ? [line, place].filter(Boolean).join(", ") : "";
  });
  // Indirizzo scelto senza numero civico (es. solo la via): lo si chiede a parte.
  const [askHouseNumber, setAskHouseNumber] = useState(false);
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
  const [result, setResult] = useState<{ matchedProfessionals: number; requestsCount: number } | null>(null);
  // Una foto/video selezionato prima di autenticarsi (`file` valorizzato)
  // resta locale — anteprima via `URL.createObjectURL`, mai caricata su
  // Cloudinary finché non esiste un token — e viene caricata solo al
  // momento dell'invio effettivo (`doSubmit`). Una volta autenticati, ogni
  // nuova selezione carica subito come prima (`file: null`, `url` è già
  // l'URL Cloudinary reale). Richiesta esplicita dell'utente, "Verbale
  // Cognitivo" F2.2: anche le foto devono restare compilabili da anonimo.
  const [photos, setPhotos] = useState<{ url: string; file: File | null; isVideo: boolean }[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  // Gate di autenticazione spostato al momento dell'invio (F2.2): il modulo
  // resta sempre compilabile da anonimo, il gate compare solo qui, senza
  // mai far perdere quanto già scritto/selezionato (nessuna navigazione).
  const [showAuthGate, setShowAuthGate] = useState(false);
  // Vero tra "l'utente si è appena autenticato dal gate" e "l'effetto sotto
  // ha potuto rileggere il nuovo token dal contesto" — l'invio vero riparte
  // da lì, mai dalla chiusura di handleSubmit (che avrebbe ancora in mano
  // il vecchio `token` nullo, un problema di closure stale).
  const [pendingSubmit, setPendingSubmit] = useState(false);

  // Riparte da sola non appena il token diventa disponibile dopo il gate
  // (login/registrazione appena completati dentro InlineAuthGate, senza
  // mai lasciare questa pagina) — legge il token corrente dal contesto,
  // mai quello (nullo) catturato dalla chiusura di handleSubmit.
  useEffect(() => {
    if (!pendingSubmit || !token) return;
    setPendingSubmit(false);
    setShowAuthGate(false);
    void doSubmit(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSubmit, token]);
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

  if (result) {
    return (
      <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
        <YStack width="100%" maxWidth={480} gap="$4" alignItems="center">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$7" color={brand.grafite} textAlign="center">
            {result.requestsCount > 1 ? `${result.requestsCount} richieste inviate!` : "Richiesta inviata!"}
          </Text>
          <Text color={brand.grafite70} textAlign="center">
            {result.matchedProfessionals > 0
              ? professionalProfileId
                ? `La tua richiesta è stata inviata a ${shownProfessionalName ?? "il professionista che hai scelto"}${isUrgent ? ", segnata come urgente" : ""}. Riceverai il preventivo qui appena arriva.`
                : result.requestsCount > 1
                  ? `Una per ogni categoria, inviate ai professionisti della tua zona${isUrgent ? " e segnate come urgenti" : ""}. Le trovi separate in Le mie richieste.`
                  : `La tua richiesta è stata inviata ai professionisti della tua zona${isUrgent ? ", segnata come urgente" : ""}. Riceverai i preventivi qui appena disponibili.`
              : `Al momento non ci sono professionisti disponibili per ${result.requestsCount > 1 ? "queste categorie" : "questa categoria"} in questa città, ma ${result.requestsCount > 1 ? "le richieste sono state registrate" : "la richiesta è stata registrata"}: te lo faremo sapere appena se ne iscrive uno.`}
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

  /** Controlli del passo 1 (il lavoro) e del passo 2 (dove): null se tutto a posto. */
  function validateStep(which: 1 | 2): string | null {
    if (which === 1) {
      if (!categorySlug) return "Scegli almeno una categoria.";
      if (description.trim().length < 10) return "Descrivi il lavoro con almeno 10 caratteri.";
      return null;
    }
    // Città obbligatoria anche online se la richiesta è generale: decide a
    // chi arriva (docs/CHANGELOG.md §210).
    if (serviceMode === "ONLINE" && !professionalProfileId && !city.trim()) return "Indica la città: la richiesta arriva ai professionisti della zona.";
    if (city.trim() && !cityComune) return "Scegli la città dall'elenco dei comuni.";
    // Città, indirizzo e destinatario obbligatori a domicilio: per una
    // consulenza online restano facoltativi (richiesta esplicita dell'utente).
    if (serviceMode === "HOME") {
      if (chosenAddress.missing) return addressText.trim() ? ADDRESS_NOT_CHOSEN_MESSAGE : "Indica l'indirizzo.";
      if (!city.trim()) return "Indica la città in cui serve l'intervento.";
      if (!street.trim()) return "Indica l'indirizzo.";
      if (!recipientName.trim() || !recipientSurname.trim()) return "Indica nome e cognome di chi riceverà il professionista.";
      if (!recipientPhone.trim()) return "Indica un numero di telefono.";
      if (!isPlausiblePhoneNumber(recipientPhone)) return "Controlla il numero di telefono: sembra incompleto o troppo lungo.";
      if (!houseNumber.trim()) return "Indica il numero civico.";
      if (!postalCode.trim()) return "Indica il CAP.";
      if (!province.trim()) return "Indica la provincia.";
    }
    return null;
  }

  async function goToStep(next: 1 | 2 | 3) {
    setError(null);
    if (next > step) {
      const problem = validateStep(1) ?? (next === 3 ? validateStep(2) : null);
      if (problem) {
        setError(problem);
        if (validateStep(1)) setStep(1);
        return;
      }
    }
    if (next === 3 && !professionalProfileId) {
      for (const slug of categorySlugs) {
        const availability = await apiClient.generalRequestAvailability(slug, city).catch(() => null);
        const closed = availability && !availability.open ? availability.closedScope : null;
        setGeneralClosed(closed);
        setClosedCategorySlug(closed ? slug : null);
        if (closed) return;
      }
    }
    setStep(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    setError(null);
    const problem = validateStep(1) ?? validateStep(2);
    if (problem) {
      setError(problem);
      return;
    }
    // Gate di autenticazione all'ultimo passo prima dell'invio (F2.2): tutto
    // il resto del modulo resta compilabile da anonimo.
    if (!user || !token) {
      setShowAuthGate(true);
      return;
    }
    await doSubmit(token);
  }

  async function doSubmit(activeToken: string) {
    setIsSubmitting(true);
    try {
      // Le foto scelte prima di autenticarsi sono ancora solo locali
      // (`file` valorizzato, `url` è un blob: di anteprima): caricate su
      // Cloudinary solo ora che un token è garantito disponibile. Quelle
      // già caricate (utente già loggato al momento della selezione)
      // restano invariate.
      const uploadedUrls: string[] = [];
      for (const photo of photos) {
        if (photo.file) {
          const uploaded = await apiClient.uploadGuidedRequestPhoto(activeToken, photo.file);
          uploadedUrls.push(uploaded.imageUrl);
          URL.revokeObjectURL(photo.url);
        } else {
          uploadedUrls.push(photo.url);
        }
      }
      const response = await apiClient.createGuidedRequest(activeToken, {
        categorySlug: categorySlug as ProfessionalCategorySlug,
        extraCategorySlugs: professionalProfileId ? [] : categorySlugs.slice(1),
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
        serviceMode,
        photoUrls: uploadedUrls,
        professionalProfileId,
        forwardIfNoReply: professionalProfileId ? forwardIfNoReply : false,
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
        // Lo stesso numero con o senza "+39" non conta come cambiato.
        const comparable = (key: string, v: string) => (key === "phone" ? normalizePhoneNumber(v) : v);
        const differs = !snapshot || Object.keys(current).some((key) => comparable(key, current[key]!) !== comparable(key, snapshot[key] ?? ""));
        setAccountDataDiffers(differs);
      }
      setResult({ matchedProfessionals: response.matchedProfessionals, requestsCount: response.requests?.length ?? 1 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto, riprova.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || photos.length >= MAX_PHOTOS) return;

    setPhotoError(null);
    if (token) {
      setIsUploadingPhoto(true);
      try {
        // Cloudinary ridimensiona e comprime lato server (stessa
        // trasformazione dell'immagine profilo professionista): una foto
        // da cellulare può pesare diversi MB, qui viene ridotta prima di
        // finire nel database come URL — richiesta esplicita dell'utente
        // ("ridimensionala per occupare meno memoria").
        const result = await apiClient.uploadGuidedRequestPhoto(token, file);
        setPhotos((prev) => [...prev, { url: result.imageUrl, file: null, isVideo: false }].slice(0, MAX_PHOTOS));
      } catch (err) {
        setPhotoError(err instanceof Error ? err.message : "Errore durante il caricamento della foto.");
      } finally {
        setIsUploadingPhoto(false);
      }
      return;
    }
    // Anonimo: nessun token per caricare su Cloudinary — resta locale con
    // un'anteprima via blob:, caricata davvero solo al momento dell'invio
    // (doSubmit, dopo il gate F2.2).
    const previewUrl = URL.createObjectURL(file);
    setPhotos((prev) => [...prev, { url: previewUrl, file, isVideo: file.type.startsWith("video/") }].slice(0, MAX_PHOTOS));
  }

  function removePhoto(url: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.url === url);
      if (target?.file) URL.revokeObjectURL(target.url);
      return prev.filter((p) => p.url !== url);
    });
  }

  return (
    <>
    <YStack width="100%" alignItems="center" backgroundColor="transparent" paddingVertical="$9" paddingHorizontal="$4">
      <YStack width="100%" maxWidth={560} gap="$5">
        <YStack gap="$3">
          <Text fontFamily="$heading" fontWeight="800" fontSize="$8" color={brand.grafite}>
            {title}
          </Text>
          {professionalProfileId && shownProfessionalName ? (
            // Richiesta rivolta a un professionista specifico (si arriva dal
            // suo profilo pubblico o da una fascia della sua agenda): il
            // sottotitolo generico ("lo inviamo subito ai professionisti
            // compatibili nella tua zona") era fuorviante, il cliente non
            // capiva che stava scrivendo a lui e non a un elenco di
            // professionisti — richiesta esplicita dell'utente. Riquadro con
            // foto+nome al posto del sottotitolo generico, non in aggiunta.
            <>
              <XStack
                alignItems="center"
                gap="$3"
                alignSelf="flex-start"
                backgroundColor={brand.calce}
                borderWidth={1}
                borderColor={brand.filetto}
                borderRadius={radiusDoc}
                paddingHorizontal="$4"
                paddingVertical="$3"
              >
                <ProfessionalAvatar imageUrl={shownProfessionalImage} categorySlug={selectedCategory?.slug ?? categorySlug} size={48} />
                <YStack>
                  <Text fontSize="$2" color={brand.grafite70}>
                    Stai inviando una richiesta a
                  </Text>
                  <Text fontFamily="$heading" fontWeight="800" fontSize="$5" color={brand.grafite}>
                    {shownProfessionalName}
                  </Text>
                  {professional ? (
                    <Text fontSize="$2" color={brand.grafite70}>
                      {[
                        professional.categoryLabel,
                        professional.rating !== null && professional.reviewCount > 0
                          ? `★ ${professional.rating.toLocaleString("it-IT")} (${professional.reviewCount})`
                          : null,
                        professional.avgResponseTimeMinutes !== null ? `di solito risponde in ${formatResponseTime(professional.avgResponseTimeMinutes)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  ) : null}
                </YStack>
              </XStack>
              {professional && !professional.acceptingRequests ? (
                // Account in pausa per l'abbonamento (docs/CHANGELOG.md §162): il server rifiuterebbe l'invio.
                <Text color={brand.urgenza} fontWeight="700">
                  {shownProfessionalName} al momento non accetta nuove richieste. Puoi inviarla ai professionisti della tua zona dalla{" "}
                  <Link href={`/preventivo?categoria=${professional.categorySlug}`}>richiesta di preventivo</Link>.
                </Text>
              ) : (
                <Text color={brand.grafite70}>Descrivi il lavoro: la richiesta arriva a {shownProfessionalName}.</Text>
              )}
            </>
          ) : (
            <Text color={brand.grafite70}>{subtitle}</Text>
          )}
        </YStack>

        {generalClosed ? (
          <GeneralRequestsClosedNotice
            scope={generalClosed}
            categorySlug={closedCategorySlug ?? (categorySlug || null)}
            categoryLabel={PROFESSIONAL_CATEGORIES.find((c) => c.slug === (closedCategorySlug ?? categorySlug))?.label ?? null}
            city={city}
            canRemove={Boolean(closedCategorySlug) && categorySlugs.length > 1}
            onRemove={() => {
              if (closedCategorySlug) toggleCategory(closedCategorySlug);
            }}
          />
        ) : null}

        {generalClosed === "GLOBAL" ? null : (
        <>
        <StepIndicator step={step} onGo={(next) => void goToStep(next)} />

        {step === 1 ? (
          <>
        {professionalProfileId && selectedCategory ? (
          // Professionista già scelto: nessuna categoria da scegliere
          // (decisione dell'utente, docs/CHANGELOG.md §217). La richiesta usa
          // quella del link se è una delle sue, altrimenti la principale.
          null
        ) : (
          <YStack gap="$2">
            <XStack justifyContent="space-between" alignItems="baseline" gap="$2">
              <FieldLabel>Categorie</FieldLabel>
              <Text fontSize="$2" color={brand.grafite70} aria-live="polite">
                {categorySlugs.length > 0 ? `${categorySlugs.length} di ${MAX_REQUEST_CATEGORIES}` : `Fino a ${MAX_REQUEST_CATEGORIES}`}
              </Text>
            </XStack>
            {/* Più categorie insieme (docs/CHANGELOG.md §259), a tessere come
                nella registrazione del professionista (§279), con le più
                cercate nella città di partenza prima. */}
            <CategoryTiles value={categorySlugs} onToggle={toggleCategory} max={MAX_REQUEST_CATEGORIES} city={initialCity} ariaLabel="Categorie" />
            {categorySlugs.length > 1 ? (
              <Text fontSize="$2" color={brand.grafite70}>
                Riceverai una richiesta separata per ogni categoria.
              </Text>
            ) : null}
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

        <label className="guided-urgent-toggle">
          <input type="checkbox" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} />
          <span>
            <strong>È urgente?</strong>
            {isUrgent ? (
              <small>
                {professionalProfileId
                  ? `Sì: arriva a ${shownProfessionalName ?? "il professionista"} segnata come urgente. Se non risponde entro 60 minuti, nel riepilogo puoi scegliere di inoltrarla anche ad altri professionisti della zona.`
                  : "Sì: la mandiamo subito a tutti i professionisti della zona, segnata come urgente."}
              </small>
            ) : null}
          </span>
        </label>

        {professionalProfileId && displaySlots.length > 0 ? (
          <YStack gap="$2">
            <FieldLabel>Data e orario dell&apos;intervento (facoltativo)</FieldLabel>
            <Text fontSize="$2" color={brand.grafite70}>
              {preferredDate && preferredTimeSlot
                ? "Hai scelto questo orario dall'agenda del professionista — puoi cambiarlo qui, sempre tra quelli davvero liberi."
                : "Scegli un orario tra quelli liberi nell'agenda del professionista, oppure lascia senza preferenza."}{" "}
              La richiesta non prenota subito l&apos;orario: il professionista ti risponderà con un preventivo.
            </Text>
            <select aria-label="Data e orario dell'intervento"
              value={selectedSlotValue}
              onChange={(e) => setSelectedSlotValue(e.target.value)}
              style={{
                padding: 12,
                borderRadius: 4,
                border: `1px solid ${brand.bordoCampo}`,
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
          <textarea aria-label="Descrivi il lavoro"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={resolvedDescriptionPlaceholder}
            rows={5}
            style={{
              padding: 12,
              borderRadius: 4,
              border: `1px solid ${brand.bordoCampo}`,
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
            {photos.map((photo) => (
              <YStack
                key={photo.url}
                width={88}
                height={88}
                borderRadius="$3"
                overflow="hidden"
                position="relative"
                borderWidth={1}
                borderColor={brand.filetto}
              >
                <MediaPreview url={photo.url} forceVideo={photo.isVideo} />
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
                  onPress={() => removePhoto(photo.url)}
                  accessibilityRole="button"
                  accessibilityLabel="Rimuovi foto"
                >
                  <X size={13} strokeWidth={2} color="white" />
                </YStack>
              </YStack>
            ))}
            {photos.length < MAX_PHOTOS ? (
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
                {isUploadingPhoto ? (
                  <UploadingDots dotSize={7} />
                ) : (
                  <Text fontSize="$7" color={brand.grafite70}>
                    +
                  </Text>
                )}
                <Text fontSize="$1" color={brand.grafite70}>
                  {isUploadingPhoto ? "Caricamento" : "Aggiungi"}
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

          </>
        ) : null}

        {step === 2 ? (
          <>
        {serviceMode === "HOME" && !chosenAddress.serviceDown ? null : (
        <YStack gap="$2">
          <FieldLabel>{cityOptional ? "Città (facoltativa)" : "Città"}</FieldLabel>
          {/* `.guided-city`: stesso fondo bianco degli altri campi (prima grigio, docs/CHANGELOG.md §154). */}
          <div className="guided-city">
          <YStack borderWidth={1} borderColor={brand.filetto} borderRadius="$4" backgroundColor={brand.calce}>
            <Autocomplete
              items={ALL_ITALIAN_CITY_NAMES}
              getKey={(item) => item}
              getLabel={(item) => item}
              onSelect={changeCity}
              value={city}
              onChangeText={changeCity}
              placeholder="Es. Roma"
              size="$5"
              minChars={3}
            />
          </YStack>
          </div>
          {cityOptional ? (
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
        )}

        {serviceMode === "HOME" ? (
          <YStack gap="$3">
            <YStack gap="$1">
              <Text fontSize="$2" color={brand.grafite70}>
                I dati di seguito rimarranno nascosti al professionista finché non accetterai un preventivo.
              </Text>
            </YStack>

            <XStack gap="$2" flexWrap="wrap">
              <YStack flex={1} minWidth={160}>
                <input aria-label="Nome" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Nome" style={fieldInputStyle} />
              </YStack>
              <YStack flex={1} minWidth={160}>
                <input aria-label="Cognome"
                  value={recipientSurname}
                  onChange={(e) => setRecipientSurname(e.target.value)}
                  placeholder="Cognome"
                  style={fieldInputStyle}
                />
              </YStack>
            </XStack>

            <PhoneNumberInput value={recipientPhone} onChange={setRecipientPhone} style={fieldInputStyle} />

            {chosenAddress.serviceDown ? (
              // Suggerimenti non disponibili: campi separati, come prima.
              <>
                <XStack gap="$2" flexWrap="wrap">
                  <YStack flex={2} flexBasis={0} minWidth={180}>
                    <input aria-label="Via o piazza" value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Via o piazza" style={fieldInputStyle} />
                  </YStack>
                  <YStack flex={1} flexBasis={0} minWidth={110}>
                    <input aria-label="Numero civico" value={houseNumber} onChange={(e) => setHouseNumber(e.target.value)} placeholder="Civico" style={fieldInputStyle} />
                  </YStack>
                </XStack>
                <XStack gap="$2" flexWrap="wrap">
                  <YStack flex={1} flexBasis={0} minWidth={100}>
                    <input aria-label="CAP" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} placeholder="CAP" style={fieldInputStyle} />
                  </YStack>
                  <YStack flex={1} flexBasis={0} minWidth={100}>
                    <input
                      aria-label="Provincia"
                      value={province}
                      onChange={(e) => setProvince(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2))}
                      placeholder="Provincia (es. RM)"
                      style={fieldInputStyle}
                    />
                  </YStack>
                </XStack>
              </>
            ) : (
              <YStack gap="$1">
                {/* Via e città insieme: la scelta dall'elenco compila città,
                    civico, CAP e provincia (docs/CHANGELOG.md §141, §214, §264). */}
                <AddressAutocompleteInput
                  value={addressText}
                  onChange={(next) => {
                    setAddressText(next);
                    setAddressVerified(false);
                  }}
                  onSelect={(selected) => {
                    const comune = selected.locality ? findComuneByName(selected.locality) : undefined;
                    setStreet(selected.street ?? selected.address);
                    setHouseNumber(selected.houseNumber ?? "");
                    setAskHouseNumber(!selected.houseNumber);
                    setPostalCode(selected.postalCode ?? "");
                    setProvince(selected.province ?? comune?.province ?? "");
                    setCity(comune?.name ?? selected.locality ?? "");
                    setAddressVerified(true);
                  }}
                  biasTowards={cityComune ? { latitude: cityComune.lat, longitude: cityComune.lon } : null}
                  onServiceUnavailable={chosenAddress.markServiceDown}
                  placeholder="Indirizzo, es. Via Roma 5, Bari"
                  style={fieldInputStyle}
                />
                {chosenAddress.missing && addressText.trim() ? (
                  <Text fontSize="$2" color={brand.grafite70}>
                    Scegli l&apos;indirizzo dall&apos;elenco che compare mentre scrivi.
                  </Text>
                ) : null}
                {chosenAddress.chosen && (askHouseNumber || !houseNumber.trim()) ? (
                  <input
                    aria-label="Numero civico"
                    value={houseNumber}
                    onChange={(e) => setHouseNumber(e.target.value)}
                    placeholder="Numero civico"
                    style={{ ...fieldInputStyle, maxWidth: 180, marginTop: 6 }}
                  />
                ) : null}
              </YStack>
            )}

            <input aria-label="Scala, piano, interno"
              value={addressExtra}
              onChange={(e) => setAddressExtra(e.target.value)}
              placeholder="Scala, piano, interno (facoltativo)"
              style={fieldInputStyle}
            />
          </YStack>
        ) : null}

          </>
        ) : null}

        {step === 3 ? (
          <RequestSummary
            isUrgent={isUrgent}
            professionalName={professionalProfileId ? shownProfessionalName ?? "il professionista" : null}
            categoryLabels={selectedCategories.map((c) => c.label)}
            serviceMode={serviceMode}
            description={description}
            city={[postalCode, city].filter((v) => v.trim()).join(" ") + (province.trim() && city.trim() ? ` (${province.trim()})` : "")}
            address={[[street, houseNumber].filter((v) => v.trim()).join(" "), addressExtra].filter((v) => v.trim()).join(", ")}
            contact={
              serviceMode === "HOME"
                ? [[recipientName, recipientSurname].filter((v) => v.trim()).join(" "), recipientPhone].filter((v) => v.trim()).join(" · ")
                : ""
            }
            photosCount={photos.length}
            slotLabel={
              finalPreferredDate && finalPreferredTimeSlot
                ? pickableSlotLabel({ date: finalPreferredDate, startTime: finalPreferredTimeSlot.split("-")[0]!, endTime: finalPreferredTimeSlot.split("-")[1]! })
                : null
            }
            forwardIfNoReply={forwardIfNoReply}
            onToggleForward={() => setForwardIfNoReply((v) => !v)}
            onEdit={goToStep}
          />
        ) : null}

        {error ? (
          <Text color={brand.urgenza} fontSize="$3">
            {error}
          </Text>
        ) : null}

        <XStack gap="$2" flexWrap="wrap">
          {step > 1 ? (
            <Button variant="secondary" onPress={() => goToStep((step - 1) as 1 | 2)} flexGrow={1} flexBasis={120}>
              Indietro
            </Button>
          ) : null}
          {step < 3 ? (
            <Button variant="primary" onPress={() => goToStep((step + 1) as 2 | 3)} flexGrow={2} flexBasis={200}>
              Avanti
            </Button>
          ) : (
            <Button
              variant={isUrgent ? "urgent" : "primary"}
              onPress={() => handleSubmit()}
              disabled={isSubmitting || isUploadingPhoto}
              opacity={isSubmitting || isUploadingPhoto ? 0.6 : 1}
              flexGrow={2}
              flexBasis={200}
            >
              <XStack alignItems="center" gap="$2">
                <Text color="white" fontFamily="$body" fontWeight="600">
                  {isSubmitting ? submittingLabel : submitLabel}
                </Text>
                <ButtonArrow />
              </XStack>
            </Button>
          )}
        </XStack>
        </>
        )}
      </YStack>
    </YStack>
    {showAuthGate ? (
      <InlineAuthGate
        onAuthenticated={() => setPendingSubmit(true)}
        onClose={() => setShowAuthGate(false)}
      />
    ) : null}
    </>
  );
}

/**
 * Richieste generali chiuse (docs/CHANGELOG.md §211): per tutto il sito o
 * per questa categoria in questa città. Rimanda alla ricerca, da cui il
 * cliente sceglie un professionista e gli scrive dal suo profilo.
 */
function GeneralRequestsClosedNotice({
  scope,
  categorySlug,
  categoryLabel,
  city,
  canRemove = false,
  onRemove,
}: {
  scope: "GLOBAL" | "ZONE";
  categorySlug: string | null;
  categoryLabel: string | null;
  city: string;
  /** Con più categorie scelte si può togliere solo quella chiusa (docs/CHANGELOG.md §259). */
  canRemove?: boolean;
  onRemove?: () => void;
}) {
  const searchHref = categorySlug ? `/cerca/${categorySlug}${city.trim() ? `?citta=${encodeURIComponent(city.trim())}` : ""}` : "/cerca";
  return (
    <YStack gap="$2" padding="$4" backgroundColor={brand.calce} borderWidth={1} borderColor={brand.filetto} borderRadius="$4">
      <Text fontWeight="700" color={brand.grafite}>
        {scope === "GLOBAL" ? "Scegli tu il professionista" : `A ${city.trim()} scegli tu il professionista`}
      </Text>
      <Text color={brand.grafite70} fontSize="$3">
        {scope === "GLOBAL"
          ? "Per ora le richieste si inviano direttamente a un professionista: cercalo, guarda profilo e recensioni e scrivigli dalla sua pagina."
          : `I professionisti${categoryLabel ? ` di ${categoryLabel}` : ""} di questa zona ricevono già molte richieste: per avere risposte più rapide scegline uno e scrivigli dalla sua pagina.`}
      </Text>
      <XStack gap="$2" flexWrap="wrap">
        <Link href={searchHref}>
          <Button variant="primary">Cerca un professionista</Button>
        </Link>
        {canRemove && categoryLabel ? (
          <Button variant="secondary" onPress={onRemove}>
            {`Togli ${categoryLabel}`}
          </Button>
        ) : null}
      </XStack>
    </YStack>
  );
}

function formatResponseTime(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "1 ora" : `${hours} ore`;
}

const STEPS = ["Il lavoro", "Dove", "Riepilogo"] as const;

/** Avanzamento del modulo (docs/CHANGELOG.md §154); si torna indietro toccando un passo già fatto. */
function StepIndicator({ step, onGo }: { step: 1 | 2 | 3; onGo: (next: 1 | 2 | 3) => void }) {
  return (
    <ol className="guided-steps" aria-label="Passaggi della richiesta">
      {STEPS.map((label, index) => {
        const n = (index + 1) as 1 | 2 | 3;
        const state = n === step ? "is-current" : n < step ? "is-done" : "";
        return (
          <li key={label} className={state} aria-current={n === step ? "step" : undefined}>
            <button type="button" onClick={() => n < step && onGo(n)} disabled={n >= step}>
              <span className="guided-step-dot">{n < step ? "✓" : n}</span>
              <span>{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Riepilogo prima dell'invio (docs/CHANGELOG.md §154): cosa si sta
 * chiedendo e, soprattutto, cosa succede dopo — a chi arriva, quanti
 * professionisti, entro quando devono rispondere.
 */
function RequestSummary({
  isUrgent,
  professionalName,
  categoryLabels,
  serviceMode,
  description,
  city,
  address,
  contact,
  photosCount,
  slotLabel,
  forwardIfNoReply,
  onToggleForward,
  onEdit,
}: {
  isUrgent: boolean;
  professionalName: string | null;
  categoryLabels: string[];
  serviceMode: "HOME" | "ONLINE";
  description: string;
  city: string;
  address: string;
  /** Chi riceve il professionista e il suo telefono (docs/CHANGELOG.md §214). */
  contact: string;
  photosCount: number;
  slotLabel: string | null;
  forwardIfNoReply: boolean;
  onToggleForward: () => void;
  onEdit: (step: 1 | 2) => void;
}) {
  // Richiesta diretta: il professionista scelto non ha scadenza, l'inoltro
  // ad altri parte dopo questo tempo (docs/CHANGELOG.md §209).
  const forwardTime = isUrgent ? "60 minuti" : "6 ore (contate dalle 8 alle 21)";
  const forwardZone = city.trim() ? "della tua zona" : `della zona di ${professionalName}`;
  const categoriesText = new Intl.ListFormat("it-IT", { type: "conjunction" }).format(categoryLabels);
  const multiple = categoryLabels.length > 1;
  return (
    <YStack gap="$4">
      <div className="guided-next">
        <strong>Cosa succede dopo l&apos;invio</strong>
        {professionalName ? (
          <ul>
            <li>
              La richiesta arriva solo a {professionalName}
              {isUrgent ? " (segnata come urgente)" : ""}, che può risponderti con un preventivo senza scadenza.
            </li>
            <li>I tuoi dati di contatto restano nascosti finché non accetti un preventivo.</li>
          </ul>
        ) : (
          <ul>
            {multiple ? (
              <li>
                Diventa {categoryLabels.length} richieste separate, una per categoria: ognuna arriva subito ai professionisti di quella
                categoria nella tua zona{isUrgent ? ", segnata come urgente" : ""}.
              </li>
            ) : (
              <li>
                La mandiamo subito a tutti i professionisti di {categoriesText} che lavorano nella tua zona
                {isUrgent ? ", segnata come urgente" : ""}.
              </li>
            )}
            <li>Possono risponderti finché la richiesta è aperta: al massimo {isUrgent ? "30" : "60"} giorni.</li>
            <li>I tuoi dati di contatto restano nascosti finché non accetti un preventivo.</li>
          </ul>
        )}
      </div>

      {professionalName ? (
        <label className="guided-forward">
          <input type="checkbox" checked={forwardIfNoReply} onChange={onToggleForward} />
          <span>
            Se {professionalName} non risponde entro {forwardTime} o non è disponibile, inoltrala anche agli altri professionisti simili {forwardZone}.
            Potrà comunque risponderti anche dopo.
          </span>
        </label>
      ) : null}

      <div className="guided-recap">
        <div>
          <span>Il lavoro</span>
          <button type="button" onClick={() => onEdit(1)}>
            Modifica
          </button>
        </div>
        <p>
          <strong>{categoriesText}</strong> · {serviceMode === "HOME" ? "A domicilio" : "Online"}
          {isUrgent ? " · Urgente" : ""}
          {slotLabel ? ` · ${slotLabel}` : ""}
        </p>
        <p className="guided-recap-text">{description}</p>
        {photosCount > 0 ? <p>{photosCount === 1 ? "1 foto o video" : `${photosCount} foto o video`}</p> : null}
        <div>
          <span>Dove</span>
          <button type="button" onClick={() => onEdit(2)}>
            Modifica
          </button>
        </div>
        <p>{[address, city].filter((v) => v.trim()).join(", ") || (serviceMode === "ONLINE" ? "Consulenza online" : "—")}</p>
        {contact ? <p>{contact}</p> : null}
      </div>
    </YStack>
  );
}

