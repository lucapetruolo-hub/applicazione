"use client";

import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  NO_CATEGORY_MESSAGE,
  PASSWORD_CONTAINS_EMAIL_MESSAGE,
  parseBillingInterval,
  parseSubscriptionTier,
  isMissingRulesProblem,
  isProfessionalCategorySlug,
  passwordContainsEmail,
  passwordProblem,
  registerSchema,
  subscriptionTierInfo,
  type ProfessionalCategorySlug,
  type ProfessionalEntityTypeValue,
  type SubscriptionTier,
} from "@professionisti/shared";
import { Button, ButtonArrow, Icon, Surface, Text, XStack, YStack, brand, radiusDocLg, type IconName } from "@professionisti/ui";
import { MagneticButton } from "@/components/MagneticButton";
import { AuthField } from "@/components/AuthField";
import { EmailCodeForm } from "@/components/EmailCodeForm";
import { apiClient } from "@/lib/apiClient";
import { prefetchCategoryOrder } from "@/lib/categoryOrder";
import { useAuth } from "@/lib/AuthContext";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { GoogleConsentModal } from "@/components/GoogleConsentModal";
import { LegalConsentCheckbox, scrollToLegalConsent } from "@/components/LegalConsentCheckbox";
import { PASSWORD_RULES_ATTRIBUTE, PasswordMatchHint, PasswordRules } from "@/components/PasswordRules";
import { CategoryMultiPicker } from "@/components/CategoryMultiPicker";
import { ClientEmailFirstAuth } from "@/components/ClientEmailFirstAuth";
import { AuthPageBackground } from "@/components/AuthPageBackground";
import { TURNSTILE_PENDING_MESSAGE, TurnstileWidget, isTurnstileEnabled } from "@/components/TurnstileWidget";
import { AuthStepHeader } from "@/components/AuthStepHeader";
import { PasswordVisibilityToggle } from "@/components/PasswordVisibilityToggle";
import { ChosenPlanChip, useChosenPlanDetail } from "@/components/ChosenPlanChip";
import { EmailSuggestion } from "@/components/EmailSuggestion";

export default function RegistratiPage() {
  return (
    <Suspense fallback={null}>
      <RegistratiForm />
    </Suspense>
  );
}

/** Due chip di fiducia compatte, stesso principio della striscia già in uso
 * nella pagina risultati di ricerca (CLAUDE.md §70, F1.4) — qui in versione
 * ridotta a due voci pertinenti al momento della registrazione. */
function TrustChips() {
  return (
    <XStack flexWrap="wrap" columnGap="2" rowGap="2" justifyContent="center">
      <XStack alignItems="center" gap="1" backgroundColor={brand.gesso} borderRadius={999} paddingHorizontal="3" paddingVertical="1">
        <Icon name="shield" size={13} color={brand.grafite70} strokeWidth={1.5} />
        <Text fontSize={13} color={brand.grafite70}>
          Dati protetti
        </Text>
      </XStack>
      <XStack alignItems="center" gap="1" backgroundColor={brand.gesso} borderRadius={999} paddingHorizontal="3" paddingVertical="1">
        <Icon name="heart-handshake" size={13} color={brand.grafite70} strokeWidth={1.5} />
        <Text fontSize={13} color={brand.grafite70}>
          Gratis, senza carta
        </Text>
      </XStack>
    </XStack>
  );
}

/** Scheda di scelta (ruolo, modo di lavorare) come link vero: tastiera,
 * apertura con il tasto "indietro" del telefono, risposta al tocco. */
function ChoiceCard({ href, replace, icon, title, text }: { href: string; replace?: boolean; icon: IconName; title: string; text: string }) {
  return (
    <Link href={href} replace={replace} className="auth-role-card-link">
      <XStack
        className="auth-role-card"
        alignItems="center"
        gap="3"
        padding="4"
        backgroundColor={brand.calce}
        borderWidth={1}
        borderColor={brand.filetto}
        borderRadius="4"
      >
        <XStack width={44} height={44} borderRadius={12} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center" flexShrink={0}>
          <Icon name={icon} size={20} color={brand.cianografiaScuro} strokeWidth={1.5} />
        </XStack>
        <YStack flex={1} flexBasis={0} minWidth={0} gap="1">
          <Text fontWeight="700" color={brand.grafite}>
            {title}
          </Text>
          <Text fontSize={13} color={brand.grafite70}>
            {text}
          </Text>
        </YStack>
        <Icon name="chevron-right" size={18} color={brand.grafite70} />
      </XStack>
    </Link>
  );
}

/**
 * Scelta cliente/professionista prima del form vero e proprio — richiesta
 * esplicita dell'utente: cliccando "Registrati" da /accedi (unico punto
 * d'ingresso che arriva qui senza un ruolo già deciso, a differenza dei
 * link "Iscriviti gratis"/"Offri i tuoi servizi" sparsi nel sito che
 * passano già `?ruolo=professionista`) si finiva sempre sulla
 * registrazione cliente, senza poter scegliere. `ruolo=cliente` è un
 * valore nuovo nell'URL (prima l'assenza del parametro significava
 * implicitamente cliente): i link esistenti che passano già
 * `ruolo=professionista` continuano a saltare questa schermata come prima.
 */
function RoleChoiceScreen({
  hrefFor,
  noAccountFound,
}: {
  hrefFor: (role: "cliente" | "professionista") => string;
  /** Vero se si arriva qui da "Accedi con Google" su un'email senza account (vedi /accedi). */
  noAccountFound?: boolean;
}) {
  return (
    <AuthPageBackground>
      <Surface className="auth-card-in" width="100%" maxWidth={480} borderRadius={radiusDocLg} padding="6" gap="5">
        <AuthStepHeader icon="user-round" title="Come vuoi registrarti?" />

        {noAccountFound ? (
          <YStack padding="3" borderRadius="4" borderWidth={1} borderColor={brand.urgenza} backgroundColor={brand.urgenzaVelo}>
            <Text fontSize={16} color={brand.urgenza}>
              Nessun account trovato con questa email. Scegli come registrarti per continuare.
            </Text>
          </YStack>
        ) : null}

        <YStack gap="3">
          <ChoiceCard href={hrefFor("cliente")} replace icon="search" title="Sono un cliente" text="Cerco un professionista per un lavoro." />
          <ChoiceCard href={hrefFor("professionista")} replace icon="hard-hat" title="Sono un professionista" text="Offro i miei servizi e voglio ricevere richieste." />
        </YStack>

        <Text fontSize={16} textAlign="center" color={brand.grafite70}>
          Hai già un account?{" "}
          <Link href="/accedi" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografiaScuro} fontWeight="600">
              Accedi
            </Text>
          </Link>
        </Text>
      </Surface>
    </AuthPageBackground>
  );
}

/**
 * Passi del professionista (docs/changelog/2026-11-02-registrazione-pro-grafica.md):
 * come lavori, account, email. La scelta cliente/professionista non conta:
 * chi arriva da "Iscriviti" la salta, e partire da "Passo 2" sembrava un passo perso.
 */
const PRO_STEPS = 3;

/** Dove cambiare il piano scelto: i livelli di /per-professionisti. */
const CHANGE_PLAN_HREF = "/per-professionisti#prezzi";

/**
 * Tipo del professionista scelto in registrazione (docs/CHANGELOG.md §243,
 * decisione dell'utente: tre tipi). Nell'URL con parole leggibili, così il
 * tasto "indietro" del telefono torna alla scelta.
 */
const ENTITY_CHOICES: {
  value: ProfessionalEntityTypeValue;
  param: string;
  icon: IconName;
  label: string;
  description: string;
}[] = [
  { value: "PRIVATE_INDIVIDUAL", param: "privato", icon: "user-round", label: "Privato, senza Partita IVA", description: "Lavoro occasionale" },
  { value: "SOLE_PROPRIETOR", param: "partita-iva", icon: "briefcase", label: "Con Partita IVA", description: "Libero professionista o ditta individuale, anche forfettario." },
  { value: "BUSINESS", param: "azienda", icon: "building-2", label: "Azienda", description: "Società con dipendenti o soci: SRL, SNC, SAS, SPA." },
];

/**
 * Bozza dell'iscrizione nella scheda del browser: email e mestieri scelti
 * restano se si ricarica o si va a cambiare il piano e si torna. Mai la
 * password. Si cancella a iscrizione fatta
 * (docs/changelog/2026-11-02-registrazione-pro-migliorie.md).
 */
const SIGNUP_DRAFT_KEY = "registrati-professionista-bozza";

function readSignupDraft(): { email: string; categorySlugs: ProfessionalCategorySlug[] } | null {
  try {
    const raw = window.sessionStorage.getItem(SIGNUP_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const { email, categorySlugs } = parsed as { email?: unknown; categorySlugs?: unknown };
    return {
      email: typeof email === "string" ? email.slice(0, 254) : "",
      categorySlugs: Array.isArray(categorySlugs)
        ? categorySlugs.filter((slug): slug is ProfessionalCategorySlug => typeof slug === "string" && isProfessionalCategorySlug(slug))
        : [],
    };
  } catch {
    return null;
  }
}

function writeSignupDraft(draft: { email: string; categorySlugs: ProfessionalCategorySlug[] } | null) {
  try {
    if (draft && (draft.email.trim() || draft.categorySlugs.length > 0)) window.sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft));
    else window.sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
  } catch {
    // Archivio del browser non disponibile (navigazione privata): niente bozza.
  }
}

function entityChoiceFromParam(param: string | null) {
  return ENTITY_CHOICES.find((choice) => choice.param === param) ?? null;
}

function EntityTypeScreen({ hrefFor, onBack, chosenTier }: { hrefFor: (param: string) => string; onBack: () => void; chosenTier: SubscriptionTier | null }) {
  return (
    <ProfessionalSignupLayout
      step={1}
      stepNote="circa 2 minuti"
      icon="receipt-text"
      title="Come lavori?"
      subtitle="Così ti chiediamo solo i dati fiscali che servono a te."
      onBack={onBack}
      chosenTier={chosenTier}
      showClientLink={false}
    >
      <YStack gap="3">
        {ENTITY_CHOICES.map((choice) => (
          <ChoiceCard key={choice.value} href={hrefFor(choice.param)} icon={choice.icon} title={choice.label} text={choice.description} />
        ))}
      </YStack>

      <Text fontSize={13} color={brand.grafite70} textAlign="center">
        Senza Partita IVA scegli &quot;Privato&quot;. Puoi cambiarlo dopo da Dati fiscali.
      </Text>
    </ProfessionalSignupLayout>
  );
}

/**
 * Riepilogo delle scelte fatte, in cima al modulo: come lavori e, se arriva
 * da /per-professionisti, il piano. Un solo riquadro invece di un'etichetta
 * e un riquadro uno sopra l'altro
 * (docs/changelog/2026-11-02-registrazione-pro-migliorie.md).
 */
function SignupChoicesSummary({
  choice,
  onChangeChoice,
  chosenTier,
}: {
  choice: (typeof ENTITY_CHOICES)[number];
  onChangeChoice: () => void;
  chosenTier: SubscriptionTier | null;
}) {
  const planDetail = useChosenPlanDetail(chosenTier);
  return (
    <div className="signup-summary">
      <div className="signup-summary-row">
        <Icon name={choice.icon} size={18} color={brand.cianografiaScuro} strokeWidth={1.75} />
        <p className="signup-summary-text">
          <span className="signup-summary-label">Ti iscrivi come</span>
          <strong>{choice.label}</strong>
        </p>
        <button type="button" className="link-button" onClick={onChangeChoice} aria-label="Cambia il modo in cui lavori">
          Cambia
        </button>
      </div>
      {chosenTier ? (
        <div className="signup-summary-row">
          <Icon name="tag" size={18} color={brand.cianografiaScuro} strokeWidth={1.75} />
          <p className="signup-summary-text">
            <span className="signup-summary-label">Piano scelto</span>
            <strong>
              {subscriptionTierInfo(chosenTier).label}
              {planDetail ? <span className="signup-summary-detail"> · {planDetail}</span> : null}
            </strong>
          </p>
          <Link href={CHANGE_PLAN_HREF} className="link-button" aria-label="Cambia il piano scelto">
            Cambia
          </Link>
        </div>
      ) : null}
    </div>
  );
}

const SIGNUP_BENEFITS: { icon: IconName; title: string; text: string }[] = [
  { icon: "map-pin", title: "Richieste dalla tua zona", text: "Clienti vicino a te che cercano proprio il tuo mestiere." },
  { icon: "calendar", title: "Agenda e promemoria", text: "Appuntamenti in ordine e meno clienti che non si presentano." },
  { icon: "star", title: "Recensioni vere", text: "Solo da lavori fatti tramite il sito: la tua reputazione conta di più." },
];

/**
 * Registrazione del professionista nella stessa scheda della scelta del
 * ruolo (stessa larghezza, docs/CHANGELOG.md §181). Foto e vantaggi
 * (§173) sul computer stanno in una colonna accanto alla scheda, sul
 * telefono non ci sono: allungavano la pagina a metà iscrizione
 * (docs/changelog/2026-11-02-registrazione-pro-grafica.md). La
 * presentazione completa è in /per-professionisti.
 */
function ProfessionalSignupLayout({
  children,
  step = 2,
  stepNote,
  icon = "hard-hat",
  title = "Crea il tuo account",
  subtitle = "Poi completi il profilo e ricevi le richieste.",
  showClientLink = true,
  showAside = true,
  chosenTier = null,
  onBack,
}: {
  children: ReactNode;
  step?: number;
  /** Accanto a "Passo N di 3" (sul primo: quanto ci vuole). */
  stepNote?: string;
  icon?: IconName;
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  /** "Cerchi un professionista? Registrati come cliente" in fondo alla scheda. */
  showClientLink?: boolean;
  /** Foto e vantaggi accanto alla scheda (solo computer): non nella schermata dell'email. */
  showAside?: boolean;
  /** Piano toccato su /per-professionisti, ricordato sotto il titolo. */
  chosenTier?: SubscriptionTier | null;
}) {
  return (
    <AuthPageBackground>
      <div className={`pro-signup${showAside ? " has-aside" : ""}`}>
        <Surface className="auth-card-in pro-signup-card" width="100%" borderRadius={radiusDocLg} padding="6" gap="5">
          <AuthStepHeader icon={icon} title={title} subtitle={subtitle || undefined} step={{ current: step, total: PRO_STEPS, note: stepNote }} onBack={onBack} />
          {chosenTier ? <ChosenPlanChip tier={chosenTier} changeHref={CHANGE_PLAN_HREF} /> : null}
          {children}
          {showClientLink ? (
            <Text fontSize={16} textAlign="center" color={brand.grafite70}>
              Cerchi un professionista?{" "}
              <Link href="/registrati?ruolo=cliente" style={{ textDecoration: "none" }}>
                <Text color={brand.cianografiaScuro} fontWeight="600">
                  Registrati come cliente
                </Text>
              </Link>
            </Text>
          ) : null}
        </Surface>

        {showAside ? (
          <aside className="pro-signup-aside" aria-label="Perché iscriversi">
            <YStack width="100%" gap="5">
              <div style={{ position: "relative", width: "100%", aspectRatio: "3 / 2", borderRadius: radiusDocLg, overflow: "hidden" }}>
                <Image
                  src="/page-photos/registrati-elettricista.webp"
                  alt="Un elettricista sorride mentre lavora a un quadro elettrico"
                  fill
                  sizes="420px"
                  style={{ objectFit: "cover" }}
                />
              </div>
              <YStack gap="4">
                {SIGNUP_BENEFITS.map((benefit) => (
                  <XStack key={benefit.title} gap="3" alignItems="flex-start">
                    <XStack width={40} height={40} borderRadius={12} backgroundColor={brand.cianografiaVelo} alignItems="center" justifyContent="center" flexShrink={0}>
                      <Icon name={benefit.icon} size={19} color={brand.cianografiaScuro} strokeWidth={1.75} />
                    </XStack>
                    <YStack flex={1} gap="1">
                      <Text fontWeight="700" color={brand.grafite}>
                        {benefit.title}
                      </Text>
                      <Text fontSize={16} color={brand.grafite70}>
                        {benefit.text}
                      </Text>
                    </YStack>
                  </XStack>
                ))}
              </YStack>
              <Link href="/per-professionisti" style={{ textDecoration: "none" }}>
                <Text color={brand.cianografiaScuro} fontWeight="600">
                  Scopri come funziona e quanto costa
                </Text>
              </Link>
            </YStack>
          </aside>
        ) : null}
      </div>
    </AuthPageBackground>
  );
}

const CLIENT_HEADERS = {
  email: "Crea il tuo account",
  new: "Crea il tuo account gratuito",
  password: "Hai già un account",
  google: "Accedi con Google",
} as const;

const CLIENT_ICONS = { email: "mail", new: "lock", password: "lock", google: "mail" } as const;

function ClientSignup({ onAuthenticated, onBack }: { onAuthenticated: () => void; onBack: () => void }) {
  return (
    <AuthPageBackground>
      <Surface className="auth-card-in" width="100%" maxWidth={420} borderRadius={radiusDocLg} padding="6" gap="5">
        <ClientEmailFirstAuth
          intro="Ritrovi richieste, preventivi e professionisti salvati nel tuo account."
          submitSuffix=""
          onAuthenticated={onAuthenticated}
          renderHeader={(step, back) => (
            <AuthStepHeader icon={CLIENT_ICONS[step]} title={CLIENT_HEADERS[step]} onBack={back ?? onBack} />
          )}
        />
        <TrustChips />
        <Text fontSize={16} textAlign="center" color={brand.grafite70}>
          Offri un servizio?{" "}
          <Link href="/registrati?ruolo=professionista" style={{ textDecoration: "none" }}>
            <Text color={brand.cianografiaScuro} fontWeight="600">
              Iscriviti come professionista
            </Text>
          </Link>
        </Text>
      </Surface>
    </AuthPageBackground>
  );
}

/**
 * Casella di spunta compatta per le due dichiarazioni obbligatorie in
 * registrazione — stesso pattern visivo (riquadro 22×22, icona `check`
 * bianca su sfondo cianografia) già in uso in /dashboard/profilo per
 * "Offro anche consulenza online", qui in versione più compatta (un solo
 * rigo di testo, non una card intera) perché servono due insieme.
 */
function RegistratiForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, refreshUser } = useAuth();

  const roleParam = searchParams.get("ruolo");
  const isProfessional = roleParam === "professionista";
  // Livello toccato su /per-professionisti (docs/CHANGELOG.md §177): dopo
  // l'iscrizione si va dritti al pagamento di quel livello.
  const chosenTier = parseSubscriptionTier(searchParams.get("livello"));
  // Mensile o annuale scelto insieme al livello (docs/CHANGELOG.md §361).
  const chosenInterval = parseBillingInterval(searchParams.get("rinnovo"));
  const role = isProfessional ? "PROFESSIONAL" : "CLIENT";
  const entityChoice = entityChoiceFromParam(searchParams.get("tipo"));
  // L'ordine delle tessere "Che lavori fai?" si chiede appena si apre la
  // pagina: arrivati a quel passo le tessere compaiono subito, senza attesa
  // (docs/changelog/2026-11-02-categorie-telefono.md).
  useEffect(() => {
    if (isProfessional) prefetchCategoryOrder(undefined, "professionals");
  }, [isProfessional]);

  // Tutti gli hook prima del return condizionale sotto (regola degli hook:
  // stesso numero/ordine di hook ad ogni render).
  // Da 1 a 3 categorie (docs/CHANGELOG.md §217): obbligatorie sia con
  // email e password sia con Google, precompilano il profilo.
  // ?categoria= da "Lavora con noi" (docs/CHANGELOG.md §296): lavoro già scelto, modificabile.
  const [categorySlugs, setCategorySlugs] = useState<ProfessionalCategorySlug[]>(() => {
    const fromLink = searchParams.get("categoria");
    return fromLink && isProfessionalCategorySlug(fromLink) ? [fromLink] : [];
  });
  const [email, setEmail] = useState("");
  // Uscita dal campo email: da lì in poi "Forse intendevi …?" se il dominio sembra sbagliato.
  const [emailChecked, setEmailChecked] = useState(false);
  // Bozza ripresa dopo il primo disegno (sul server non c'è): prima di
  // allora non si scrive, per non cancellarla con i campi ancora vuoti.
  const draftLoaded = useRef(false);
  useEffect(() => {
    if (!isProfessional || draftLoaded.current) return;
    draftLoaded.current = true;
    const draft = readSignupDraft();
    if (!draft) return;
    /* eslint-disable react-hooks/set-state-in-effect -- la bozza esiste solo nel browser */
    if (draft.email) setEmail((current) => current || draft.email);
    if (draft.categorySlugs.length > 0) setCategorySlugs((current) => (current.length > 0 ? current : draft.categorySlugs));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isProfessional]);
  useEffect(() => {
    if (!isProfessional || !draftLoaded.current) return;
    writeSignupDraft({ email, categorySlugs });
  }, [isProfessional, email, categorySlugs]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // Richiesta esplicita dell'utente: campo "Conferma password" oltre a
  // nome/email/password, con il proprio toggle mostra/nascondi
  // indipendente dal campo password principale.
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  // Invio provato con una password che non rispetta le regole: quelle che
  // mancano diventano rosse (docs/CHANGELOG.md §289).
  const [passwordAttempted, setPasswordAttempted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Campo a cui si riferisce l'errore (docs/CHANGELOG.md §278): il messaggio
  // va sotto quel campo. Nullo: errore generale, sopra "Registrati".
  const [errorField, setErrorField] = useState<"categories" | "email" | "password" | "confirm" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  // Dichiarazioni obbligatorie ("Verbale di Conformità": informative lette e
  // maggiore età), dal §289 in una sola casella sul modello di Didit. Valgono
  // sia per la registrazione email+password sia per Google; l'API riceve
  // sempre le due dichiarazioni dal valore di questa casella.
  const [legalConsent, setLegalConsent] = useState(false);
  // "Registrati" resta sempre premibile (docs/CHANGELOG.md §248): senza la
  // spunta la casella diventa rossa. Il numero cambia a ogni tentativo per
  // far ripartire la scossa.
  const [consentAttempt, setConsentAttempt] = useState(0);
  // Richiesta esplicita dell'utente: "Continua con Google" deve restare
  // sempre cliccabile fin da subito (prima disabilitato finché non si
  // spuntavano le due caselle qui sotto) — il consenso, quando non ancora
  // dato, viene chiesto in un popup DOPO il login Google, non prima.
  // `pendingGoogleIdToken` valorizzato = popup aperto, in attesa di conferma.
  const [pendingGoogleIdToken, setPendingGoogleIdToken] = useState<string | null>(null);
  const [googleConsentError, setGoogleConsentError] = useState<string | null>(null);
  // Dopo la registrazione con email e password: schermata del codice
  // (docs/CHANGELOG.md §243). Chi entra con Google non la vede mai.
  const [codeStep, setCodeStep] = useState<{ token: string; email: string; resendIn: number; required: boolean } | null>(null);

  function hrefWith(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);
    const query = params.toString();
    return query ? `/registrati?${query}` : "/registrati";
  }

  function setParam(key: string, value: string | null) {
    router.replace(hrefWith(key, value));
  }

  if (roleParam !== "professionista" && roleParam !== "cliente") {
    return <RoleChoiceScreen hrefFor={(choice) => hrefWith("ruolo", choice)} noAccountFound={searchParams.get("motivo") === "nessun-account"} />;
  }

  // Cliente: accesso "prima l'email" (docs/CHANGELOG.md §176), lo stesso del
  // popup della richiesta. Un'email già registrata qui entra con la password.
  if (!isProfessional) {
    return <ClientSignup onAuthenticated={() => router.push("/")} onBack={() => setParam("ruolo", null)} />;
  }

  if (!entityChoice) {
    return <EntityTypeScreen hrefFor={(param) => hrefWith("tipo", param)} onBack={() => setParam("ruolo", null)} chosenTier={chosenTier} />;
  }

  // Con Google Sign-In questa pagina può autenticare anche un account
  // professionista già esistente (es. cliccando "Iscriviti gratis" da
  // /per-professionisti pur avendo già un profilo) — non solo una vera
  // registrazione. `isNewUser` (già restituito da /auth/register e
  // /auth/google/verify) distingue i due casi: solo chi si è appena
  // registrato deve completare il profilo, chi ha già un account va
  // dritto in Dashboard — bug reale segnalato dall'utente, prima si
  // finiva sempre su /dashboard/profilo anche da loggati.
  function afterAuth(isNewUser: boolean) {
    // Un professionista che accede di nuovo (non isNewUser) va dritto in
    // Dashboard come già prima.
    // Un account nuovo va dritto al profilo, che serve prima del piano: la
    // pagina Abbonamento senza profilo mostrava solo "Completa il tuo
    // profilo" e il livello scelto si perdeva. Il profilo se lo porta dietro
    // fino alla scelta del piano (docs/changelog/2026-11-02-registrazione-pro-grafica.md).
    if (isNewUser) {
      router.push(chosenTier ? `/dashboard/profilo?livello=${chosenTier}` : "/dashboard/profilo");
      return;
    }
    if (chosenTier) {
      router.push(`/dashboard/abbonamento?livello=${chosenTier}${chosenInterval ? `&rinnovo=${chosenInterval}` : ""}`);
      return;
    }
    router.push("/dashboard");
  }

  function fieldError(field: "categories" | "email" | "password" | "confirm", message: string) {
    setError(message);
    setErrorField(field);
    const target = { categories: "categorie", email: "email", password: "new-password", confirm: "new-password-confirm" }[field];
    const el = document.getElementById(target);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
    if (field !== "categories") el?.focus({ preventScroll: true });
  }

  async function handleRegister() {
    setError(null);
    setErrorField(null);
    // Dall'alto in basso: categorie, email, password, conferma, spunta. Il
    // consenso si controlla per ultimo, qui vale come già dato.
    const result = registerSchema.safeParse({
      email: email.trim(),
      password,
      role,
      acceptedLegalTerms: true,
      declaredAdult: true,
      categorySlugs,
      entityType: entityChoice?.value,
    });
    if (!result.success) {
      const issue = result.error.issues[0];
      const message = issue?.message ?? "Dati non validi.";
      const path = issue?.path[0];
      if (path === "password") {
        // Le regole sotto il campo dicono già cosa manca: nessun testo in più,
        // salvo la lunghezza massima che non è tra le regole.
        setPasswordAttempted(true);
        fieldError("password", isMissingRulesProblem(message) ? "" : message);
      } else if (path === "email") fieldError(path, message);
      else if (path === "categorySlugs") fieldError("categories", message);
      else setError(message);
      return;
    }
    if (passwordContainsEmail(password, result.data.email)) {
      setPasswordAttempted(true);
      fieldError("password", PASSWORD_CONTAINS_EMAIL_MESSAGE);
      return;
    }
    if (password !== confirmPassword) {
      fieldError("confirm", "Le password non coincidono.");
      return;
    }
    if (!legalConsent) {
      setConsentAttempt((n) => n + 1);
      scrollToLegalConsent();
      return;
    }
    if (isTurnstileEnabled() && !turnstileToken) {
      setError(TURNSTILE_PENDING_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    try {
      const { token, isNewUser } = await apiClient.register(
        result.data.email,
        result.data.password,
        result.data.name,
        result.data.role,
        legalConsent,
        legalConsent,
        turnstileToken ?? undefined,
        result.data.categorySlugs,
        result.data.entityType,
      );
      writeSignupDraft(null);
      const me = await login(token);
      if (isNewUser && me && !me.emailVerified) {
        setCodeStep({ token, email: me.email ?? result.data.email, resendIn: me.emailCodeResendInSeconds ?? 60, required: me.emailVerificationRequired });
        window.scrollTo({ top: 0 });
        return;
      }
      afterAuth(isNewUser);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore imprevisto, riprova.";
      if (message === PASSWORD_CONTAINS_EMAIL_MESSAGE) fieldError("password", message);
      else setError(message);
      // Il token anti-bot vale una volta sola: ne serve uno nuovo per riprovare.
      setTurnstileReset((n) => n + 1);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function completeGoogleAuth(idToken: string, accepted: boolean, adult: boolean, viaModal: boolean) {
    setIsSubmitting(true);
    try {
      const { token, isNewUser } = await apiClient.verifyGoogle(idToken, role, undefined, accepted, adult, categorySlugs, entityChoice?.value);
      writeSignupDraft(null);
      await login(token);
      afterAuth(isNewUser);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Errore imprevisto, riprova.";
      // Il backend rifiuta con questo messaggio esatto SOLO quando sta per
      // creare davvero un account nuovo (nessun account trovato per
      // quell'email) e il consenso non è ancora stato dato
      // (AuthService.verifyGoogleToken: `!existingUser && !legalConsent`)
      // — un account già esistente viene invece riconosciuto ed effettua
      // subito l'accesso, consenso o meno (richiesta esplicita
      // dell'utente: "se c'è un account già presente aprilo e basta").
      // Solo in quel caso si apre il popup, PRIMA di ripetere la chiamata
      // che crea l'account per davvero — mai una creazione senza consenso.
      if (!viaModal && message === "Devi accettare Privacy Policy e Termini di Servizio e dichiarare di avere almeno 18 anni.") {
        setGoogleConsentError(null);
        setPendingGoogleIdToken(idToken);
        return;
      }
      // Nuovo account senza categorie: si chiude il popup e si chiede di
      // sceglierle nel modulo, poi di ripetere l'accesso con Google.
      if (message === NO_CATEGORY_MESSAGE) {
        setPendingGoogleIdToken(null);
        fieldError("categories", `${NO_CATEGORY_MESSAGE} Poi premi di nuovo il pulsante di Google.`);
        return;
      }
      if (viaModal) {
        setGoogleConsentError(message);
      } else {
        setError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleCredential(idToken: string) {
    setError(null);
    setErrorField(null);
    // Un solo tentativo con lo stato di consenso corrente (le due caselle
    // qui sotto, spuntate o no): il backend riconosce da solo un account
    // già esistente per quell'email (login diretto, nessun consenso
    // richiesto) o segnala che serve il consenso solo se sta per creare
    // l'account per davvero — vedi completeGoogleAuth sopra.
    await completeGoogleAuth(idToken, legalConsent, legalConsent, false);
  }

  async function handleConfirmGoogleConsent() {
    if (!pendingGoogleIdToken) return;
    await completeGoogleAuth(pendingGoogleIdToken, legalConsent, legalConsent, true);
  }

  function handleCancelGoogleConsent() {
    setPendingGoogleIdToken(null);
    setGoogleConsentError(null);
  }

  if (codeStep) {
    return (
      <ProfessionalSignupLayout step={3} icon="mail" title="Conferma la tua email" subtitle="" showClientLink={false} showAside={false}>
        <EmailCodeForm
          token={codeStep.token}
          email={codeStep.email}
          initialResendSeconds={codeStep.resendIn}
          linkFirst
          allowChangeEmail
          onEmailChanged={(next) => {
            setCodeStep((step) => (step ? { ...step, email: next } : step));
            void refreshUser().catch(() => {});
          }}
          onVerified={async () => {
            await refreshUser().catch(() => {});
            afterAuth(true);
          }}
        />
        {/* Finché il dominio d'invio non è verificato su Resend la conferma
            non è obbligatoria (EMAIL_VERIFICATION_REQUIRED): si può andare
            avanti e confermare dopo dalla barra in alto. */}
        {!codeStep.required ? (
          <XStack justifyContent="center">
            <Button variant="secondary" onPress={() => afterAuth(true)}>
              Lo faccio dopo
            </Button>
          </XStack>
        ) : null}
      </ProfessionalSignupLayout>
    );
  }

  // Google, campi, consensi e pulsante del professionista (il cliente usa
  // ClientSignup, sopra).
  const formFields = (
    <>
      <SignupChoicesSummary choice={entityChoice} onChangeChoice={() => setParam("tipo", null)} chosenTier={chosenTier} />

      <div id="categorie">
        <span className="auth-field-label" style={{ display: "block", marginBottom: 8 }}>
          Che lavori fai?
        </span>
        <CategoryMultiPicker
          value={categorySlugs}
          onChange={(next) => {
            setCategorySlugs(next);
            if (next.length > 0 && errorField === "categories") {
              setError(null);
              setErrorField(null);
            }
          }}
        />
        {error && errorField === "categories" ? (
          <Text role="alert" display="flex" marginTop="2" fontSize={16} color={brand.urgenza}>
            {error}
          </Text>
        ) : null}
      </div>

      <GoogleSignInButton onCredential={handleGoogleCredential} />

      {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ? (
        <YStack flexDirection="row" alignItems="center" gap="3">
          <YStack flex={1} height={1} backgroundColor={brand.filetto} />
          <Text fontFamily="body" fontWeight="700" fontSize={13} color={brand.grafite70}>
            oppure
          </Text>
          <YStack flex={1} height={1} backgroundColor={brand.filetto} />
        </YStack>
      ) : null}

      {/*
       * Bug reale segnalato dall'utente: su iPhone, digitando la password
       * durante la registrazione, il sistema chiedeva "Vuoi salvare la
       * password?" ad OGNI carattere invece che una sola volta all'invio.
       * Due cause concorrenti corrette insieme: (1) il campo Email non
       * aveva alcun `autoComplete`/`name` (a differenza di /accedi, dove
       * era già stato corretto — CLAUDE.md §79/§20), quindi Safari non
       * poteva riconoscere l'intero gruppo come un modulo di creazione
       * account coerente; (2) i campi non erano mai avvolti in un vero
       * elemento HTML <form> — nessuno dei componenti Tamagui qui sotto ne
       * renderizza uno. Senza un <form> reale, l'euristica di Safari per
       * decidere "quando proporre di salvare" non ha un confine di
       * "invio" a cui ancorarsi e può rivalutare la password ad ogni
       * tocco di tasto. Il <form> qui non gestisce l'invio vero (che
       * resta sull'onPress del bottone "Registrati", invariato): serve
       * solo a dare a Safari il confine semantico corretto — onSubmit fa
       * solo preventDefault, per sicurezza nel caso un invio nativo
       * scattasse comunque (es. tasto Invio su un campo).
       *
       * Segnalato di nuovo dall'utente dopo questo fix (specificamente
       * per la registrazione professionista da mobile): investigato più a
       * fondo — DOM stabile e fuoco mai perso durante la digitazione
       * (verificato con Playwright, nessun remount del nodo <input> ad
       * ogni carattere), ma i tre campi risultavano privi di un
       * attributo `id`/`name` (`name=""` su tutti e tre): react-native-web
       * non inoltra affatto `name` al DOM (non è nell'elenco dei prop
       * forwarded di TextInput, verificato nel sorgente del pacchetto —
       * non solo un limite dei tipi TypeScript, come ipotizzato in un
       * giro precedente), ma inoltra `nativeID` come `id` HTML. Due campi
       * "Password"/"Conferma password" altrimenti indistinguibili nel DOM
       * se non per l'ordine sono un caso reale e documentato di euristiche
       * di autofill meno affidabili (alcuni gestori password si affidano
       * anche a `id`/`name`, non solo ad `autocomplete`, per abbinare
       * "nuova password" a "conferma"): `nativeID` aggiunto qui come
       * rinforzo supplementare, a costo zero, allo stesso `autoComplete`
       * già corretto sopra.
       */}
      <form onSubmit={(e) => e.preventDefault()}>
        <YStack gap="4">
          <AuthField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="nome@esempio.it"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="username"
            nativeID="email"
            aria-label="Email"
            error={error && errorField === "email" ? error : undefined}
            onBlur={() => setEmailChecked(true)}
            footer={<EmailSuggestion id="email-suggestion" email={email} checked={emailChecked} onApply={setEmail} />}
            footerId="email-suggestion"
          />
          <AuthField
            label="Password"
            rightElement={
              <PasswordVisibilityToggle visible={showPassword} onToggle={() => setShowPassword((v) => !v)} />
            }
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            secureTextEntry={!showPassword}
            // "new-password" (non "password"/"current-password"): segnala
            // al browser/gestore password del telefono che si sta creando
            // una password nuova, non inserendone una esistente — bug
            // reale segnalato dall'utente, senza questo hint il sistema
            // del telefono chiedeva ripetutamente se salvarla.
            autoComplete="new-password"
            nativeID="new-password"
            aria-label="Password"
            passwordRules={PASSWORD_RULES_ATTRIBUTE}
            error={error && errorField === "password" ? error : undefined}
            invalid={passwordAttempted && passwordProblem(password, email) !== null}
            footer={<PasswordRules id="new-password-rules" password={password} showMissing={passwordAttempted} />}
            footerId="new-password-rules"
          />
          <AuthField
            label="Conferma password"
            rightElement={
              <PasswordVisibilityToggle visible={showConfirmPassword} onToggle={() => setShowConfirmPassword((v) => !v)} />
            }
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Ripeti la password"
            secureTextEntry={!showConfirmPassword}
            autoComplete="new-password"
            nativeID="new-password-confirm"
            aria-label="Conferma password"
            passwordRules={PASSWORD_RULES_ATTRIBUTE}
            error={error && errorField === "confirm" ? error : undefined}
            footer={<PasswordMatchHint password={password} confirmPassword={confirmPassword} />}
            onSubmitEditing={handleRegister}
          />

          {/* Dichiarazioni obbligatorie ("Verbale di Conformità") in una
              sola casella (§289) — valgono anche per il pulsante Google sopra. */}
          <LegalConsentCheckbox checked={legalConsent} onToggle={() => setLegalConsent((v) => !v)} attempt={consentAttempt} />

          <TurnstileWidget onTokenChange={setTurnstileToken} resetSignal={turnstileReset} />

          {error && !errorField ? (
            <Text role="alert" color={brand.urgenza} fontSize={16}>
              {error}
            </Text>
          ) : null}

          <MagneticButton block>
          <Button
            variant="primary"
            onPress={handleRegister}
            disabled={isSubmitting}
            opacity={isSubmitting ? 0.6 : 1}
          >
            <XStack alignItems="center" gap="2">
              {isSubmitting ? <span className="button-spinner" aria-hidden="true" /> : null}
              <Text color="white" fontFamily="body" fontWeight="600">
                {isSubmitting ? "Creazione account..." : "Registrati"}
              </Text>
              {isSubmitting ? null : <ButtonArrow />}
            </XStack>
          </Button>
          </MagneticButton>
        </YStack>
      </form>

      <Text fontSize={16} textAlign="center" color={brand.grafite70}>
        Hai già un account?{" "}
        <Link href="/accedi" style={{ textDecoration: "none" }}>
          <Text color={brand.cianografiaScuro} fontWeight="600">
            Accedi
          </Text>
        </Link>
      </Text>
    </>
  );

  return (
    <>
    <ProfessionalSignupLayout onBack={() => setParam("tipo", null)}>{formFields}</ProfessionalSignupLayout>
    {pendingGoogleIdToken ? (
      <GoogleConsentModal
        consent={legalConsent}
        onToggleConsent={() => setLegalConsent((v) => !v)}
        onConfirm={handleConfirmGoogleConsent}
        onCancel={handleCancelGoogleConsent}
        isSubmitting={isSubmitting}
        error={googleConsentError}
      />
    ) : null}
    </>
  );
}
