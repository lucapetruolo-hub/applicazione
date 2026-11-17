"use client";

import { useId, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import { Search, X } from "lucide-react";
import {
  MAX_PROFESSIONAL_SERVICES,
  PROFESSIONAL_CATEGORIES,
  SERVICE_PRICE_UNITS,
  SERVICE_PRICE_UNIT_LABEL,
  canonicalServiceName,
  formatServicePrice,
  splitServiceList,
  type ProfessionalCategorySlug,
  type ServicePriceUnit,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";

/**
 * Prestazioni offerte nel profilo (docs/changelog/2026-11-17-prestazioni-veloci.md):
 * una riga che spiega perché aggiungerne tante, "Aggiungi più lavori insieme"
 * separati da virgole, e righe compatte con il prezzo che si apre solo se serve.
 */
export type EditableService = {
  name: string;
  priceMin: string;
  priceMax: string;
  priceUnit: ServicePriceUnit;
  categorySlug: string | null;
  /** Riga aperta per scrivere nome e prezzo (solo nella pagina, non si salva). */
  open?: boolean;
  /** Aggiunta da quando la pagina è aperta: etichetta "Nuova". */
  fresh?: boolean;
};

/** Prestazioni suggerite visibili prima di "Altre" (con un solo mestiere, e per mestiere quando sono più d'uno). */
const SUGGESTED_IDLE_COUNT = 8;
const SUGGESTED_IDLE_COUNT_GROUPED = 4;

const inputStyle = { padding: 10, borderRadius: 10, border: `1px solid ${brand.bordoCampo}`, fontSize: 16, fontFamily: "inherit", color: brand.grafite };

const linkButtonStyle = {
  background: "none",
  border: 0,
  padding: "8px 4px",
  minHeight: 40,
  font: "inherit",
  fontSize: 15,
  fontWeight: 700,
  color: brand.cianografiaScuro,
  cursor: "pointer",
} as const;

function priceCents(value: string): number | null {
  if (!value.trim()) return null;
  const number = Number(value.trim().replace(",", "."));
  return Number.isNaN(number) ? null : Math.round(number * 100);
}

function priceSummary(service: EditableService): string | null {
  const min = priceCents(service.priceMin);
  const max = priceCents(service.priceMax);
  if (min === null && max === null) return null;
  return `${formatServicePrice(min, max, service.priceUnit)}${service.priceUnit === "JOB" ? " a lavoro" : ""}`;
}

export function ServicesEditor({
  services,
  setServices,
  categorySlugs,
  suggestedFor,
  serviceCategory,
  datalistNames,
  quickAddRef,
}: {
  services: EditableService[];
  setServices: Dispatch<SetStateAction<EditableService[]>>;
  categorySlugs: ProfessionalCategorySlug[];
  suggestedFor: (slug: ProfessionalCategorySlug) => string[];
  serviceCategory: (service: EditableService) => ProfessionalCategorySlug | undefined;
  datalistNames: string[];
  quickAddRef?: RefObject<HTMLInputElement | null>;
}) {
  const [showAllSuggested, setShowAllSuggested] = useState<Record<string, boolean>>({});
  const [showMore, setShowMore] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [quickStatus, setQuickStatus] = useState<string | null>(null);
  const ids = useId();
  const quickId = `${ids}-veloce`;
  const moreId = `${ids}-scopri`;

  const named = services.filter((service) => service.name.trim()).length;
  const full = services.length >= MAX_PROFESSIONAL_SERVICES;

  function patch(index: number, change: Partial<EditableService>) {
    setServices((prev) => prev.map((service, i) => (i === index ? { ...service, ...change } : service)));
  }
  function remove(index: number) {
    setServices((prev) => prev.filter((_, i) => i !== index));
  }
  function add(name: string, categorySlug: ProfessionalCategorySlug | null, open = false) {
    if (full) return;
    setServices((prev) => [...prev, { name, priceMin: "", priceMax: "", priceUnit: "JOB", categorySlug, open, fresh: true }]);
  }
  /** Mestiere di un nome scritto: quello che lo suggerisce, altrimenti il principale. */
  function categoryForName(name: string): ProfessionalCategorySlug | null {
    return categorySlugs.find((slug) => suggestedFor(slug).includes(name)) ?? categorySlugs[0] ?? null;
  }

  function addQuick() {
    const { added, alreadyThere } = splitServiceList(
      quickText,
      services.map((service) => service.name),
    );
    const room = Math.max(0, MAX_PROFESSIONAL_SERVICES - services.length);
    const taken = added.slice(0, room);
    if (taken.length > 0) {
      setServices((prev) => [
        ...prev,
        ...taken.map((name) => ({ name, priceMin: "", priceMax: "", priceUnit: "JOB" as const, categorySlug: categoryForName(name), fresh: true })),
      ]);
    }
    const parts: string[] = [];
    if (taken.length > 0) parts.push(taken.length === 1 ? "Aggiunto 1 lavoro" : `Aggiunti ${taken.length} lavori`);
    if (alreadyThere > 0) parts.push(alreadyThere === 1 ? "1 c'era già" : `${alreadyThere} c'erano già`);
    if (added.length > room) parts.push(`puoi averne al massimo ${MAX_PROFESSIONAL_SERVICES}`);
    setQuickStatus(parts.length > 0 ? `${parts.join(", ")}.` : "Scrivi almeno un lavoro.");
    if (taken.length > 0 || alreadyThere > 0) setQuickText("");
  }

  const addedNames = new Set(services.map((service) => canonicalServiceName(service.name)));
  const indexed = services.map((service, index) => ({ service, index }));
  const groups: { key: string; slug: ProfessionalCategorySlug | null; label: string | null; rows: typeof indexed; suggested: string[] }[] =
    categorySlugs.length > 0
      ? categorySlugs.map((slug) => ({
          key: slug,
          slug,
          label: PROFESSIONAL_CATEGORIES.find((category) => category.slug === slug)?.label ?? null,
          rows: indexed.filter(({ service }) => serviceCategory(service) === slug),
          suggested: suggestedFor(slug).filter((name) => !addedNames.has(name)),
        }))
      : [{ key: "tutte", slug: null, label: null, rows: indexed, suggested: [] }];

  return (
    <>
      {/* Perché aggiungerne tante: con la ricerca dal problema chi offre quel
          lavoro va prima (professionals.service.ts, matchedServiceId). */}
      <XStack className="services-why" gap="2" alignItems="flex-start" padding="3" borderRadius="3" backgroundColor={brand.cianografiaVelo}>
        <Search size={18} strokeWidth={2} color={brand.cianografiaScuro} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
        <YStack flex={1} gap="2">
          <Text fontSize={15} color={brand.grafite}>
            <Text fontSize={15} fontWeight="700" color={brand.grafite}>
              Ogni lavoro che aggiungi ti fa trovare.
            </Text>{" "}
            Quando un cliente descrive quel problema, compari prima di chi non lo offre.{" "}
            <button type="button" className="services-more" aria-expanded={showMore} aria-controls={moreId} onClick={() => setShowMore((value) => !value)}>
              {showMore ? "Mostra meno" : "Scopri di più"}
            </button>
          </Text>
          {showMore ? (
            <YStack id={moreId} gap="1">
              <Text fontSize={14} color={brand.grafite}>
                Il sito confronta le parole del cliente con i nomi dei tuoi lavori: se ne offri uno che corrisponde, nei risultati sei tra i primi e il cliente lo legge sulla tua scheda.
              </Text>
              <Text fontSize={14} color={brand.grafite}>
                Usa i nomi che usano i clienti e metti tutti i lavori che fai davvero: uno che non fai ti porta richieste da rifiutare. Il prezzo è facoltativo, senza il cliente legge &quot;Su richiesta&quot;. Nel preventivo poi le inserisci con un tocco. Puoi aggiungerne fino a {MAX_PROFESSIONAL_SERVICES}.
              </Text>
            </YStack>
          ) : null}
        </YStack>
      </XStack>

      <Text fontSize={14} color={brand.grafite70} aria-live="polite">
        {named === 0
          ? "Nessun lavoro ancora: aggiungine qualcuno qui sotto."
          : `${named === 1 ? "1 lavoro aggiunto" : `${named} lavori aggiunti`}${named < MAX_PROFESSIONAL_SERVICES ? ": più ne metti, più ricerche ti trovano." : "."}`}
      </Text>

      {/* "Aggiungi più lavori insieme" (idea di Luca): virgole o a capo; sul
          telefono basta anche un lavoro alla volta con Invio. */}
      <YStack gap="2">
        <label htmlFor={quickId} style={{ fontSize: 15, fontWeight: 700, color: brand.grafite }}>
          Aggiungi più lavori insieme
        </label>
        <XStack gap="2" alignItems="center" flexWrap="wrap">
          <input
            id={quickId}
            ref={quickAddRef}
            value={quickText}
            disabled={full}
            enterKeyHint="done"
            autoComplete="off"
            onChange={(e) => {
              setQuickText(e.target.value);
              setQuickStatus(null);
            }}
            onPaste={(e) => {
              // Un elenco incollato a righe diventa un elenco a virgole: il campo non tiene gli "a capo".
              const pasted = e.clipboardData.getData("text");
              if (!/[\r\n]/.test(pasted)) return;
              e.preventDefault();
              const joined = pasted.split(/[\r\n]+/).map((line) => line.trim()).filter(Boolean).join(", ");
              setQuickText((prev) => (prev.trim() ? `${prev.replace(/[\s,]+$/, "")}, ${joined}` : joined));
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              addQuick();
            }}
            placeholder={full ? `Hai già ${MAX_PROFESSIONAL_SERVICES} lavori` : "Es. sturatura scarichi, sostituzione sifone"}
            aria-describedby={`${quickId}-aiuto`}
            style={{ ...inputStyle, padding: 12, flex: 1, minWidth: 220, height: 48 }}
          />
          <Button variant="primary" size="3" height={48} disabled={full || !quickText.trim()} onPress={addQuick}>
            Aggiungi
          </Button>
        </XStack>
        <Text id={`${quickId}-aiuto`} fontSize={13} color={brand.grafite70}>
          Separali con una virgola. Il prezzo puoi metterlo dopo.
        </Text>
        {quickStatus ? (
          <Text fontSize={14} fontWeight="600" color={brand.cianografiaScuro} role="status">
            {quickStatus}
          </Text>
        ) : null}
      </YStack>

      {/* Mentre scrive, il professionista vede i nomi già usati: scegliendone
          uno, la sua prestazione si somma alle altre uguali nella ricerca e
          nei prezzi medi (docs/CHANGELOG.md §392). */}
      <datalist id="prestazioni-suggerite">
        {datalistNames.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {/* Un riquadro per mestiere quando ce n'è più di uno (richiesta di Luca,
          docs/changelog/2026-11-05-registrazione-colonna-unica.md). */}
      {groups.map((group) => {
        const boxed = groups.length > 1;
        const idleCount = boxed ? SUGGESTED_IDLE_COUNT_GROUPED : SUGGESTED_IDLE_COUNT;
        const visibleSuggested = showAllSuggested[group.key] ? group.suggested : group.suggested.slice(0, idleCount);
        return (
          <YStack
            key={group.key}
            role={boxed ? "group" : undefined}
            aria-label={boxed && group.label ? `Prestazioni da ${group.label}` : undefined}
            gap="3"
            {...(boxed ? { padding: "4", borderRadius: 20, borderWidth: 1, borderColor: brand.filetto } : {})}
          >
            {boxed && group.slug ? (
              <XStack gap="3" alignItems="center">
                <CategoryIconBadge slug={group.slug} size={36} />
                <Text flex={1} fontSize={17} fontWeight="700" color={brand.grafite}>
                  {group.label}
                </Text>
                <Text fontSize={13} color={brand.grafite70}>
                  {group.rows.length === 0 ? "Nessuna ancora" : group.rows.length === 1 ? "1 aggiunta" : `${group.rows.length} aggiunte`}
                </Text>
              </XStack>
            ) : null}

            {group.suggested.length > 0 && !full ? (
              <YStack gap="1">
                <Text fontSize={13} color={brand.grafite70}>
                  {boxed || !group.label ? "Più cercati dai clienti:" : `Più cercati dai clienti per ${group.label}:`}
                </Text>
                <YStack flexDirection="row" flexWrap="wrap" gap="2">
                  {visibleSuggested.map((name) => (
                    <XStack
                      key={name}
                      paddingHorizontal="3"
                      paddingVertical="2"
                      borderRadius={999}
                      borderWidth={1}
                      borderColor={brand.cianografia}
                      backgroundColor={brand.cianografiaVelo}
                      cursor="pointer"
                      onPress={() => add(name, group.slug)}
                      role="button"
                      aria-label={`Aggiungi ${name}`}
                    >
                      <Text color={brand.cianografiaScuro} fontWeight="600" fontSize={16}>
                        + {name}
                      </Text>
                    </XStack>
                  ))}
                  {group.suggested.length > idleCount ? (
                    <XStack
                      paddingHorizontal="3"
                      paddingVertical="2"
                      borderRadius={999}
                      borderWidth={1}
                      borderColor={brand.bordoCampo}
                      cursor="pointer"
                      onPress={() => setShowAllSuggested((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
                      role="button"
                      aria-expanded={!!showAllSuggested[group.key]}
                    >
                      <Text color={brand.grafite} fontWeight="600" fontSize={16}>
                        {showAllSuggested[group.key] ? "Mostra meno" : `Altre ${group.suggested.length - idleCount}`}
                      </Text>
                    </XStack>
                  ) : null}
                </YStack>
              </YStack>
            ) : null}

            {group.rows.length > 0 ? (
              <YStack>
                {group.rows.map(({ service, index }) => {
                  const summary = priceSummary(service);
                  const editing = service.open || !service.name.trim();
                  const label = service.name.trim() || "prestazione";
                  return (
                    <YStack key={index} className="service-item" paddingVertical="3" gap="2" borderTopWidth={1} borderColor={brand.filetto}>
                      {editing ? (
                        <YStack className="service-row" flexDirection="row" gap="2" alignItems="center" flexWrap="wrap">
                          <input
                            aria-label="Nome della prestazione"
                            list="prestazioni-suggerite"
                            value={service.name}
                            onChange={(e) => patch(index, { name: e.target.value })}
                            placeholder="Es. Sostituzione caldaia"
                            className="service-name"
                            style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                          />
                          {/* Unità, prezzo e "X" insieme: sul telefono stanno su una
                              riga sola sotto al nome, mai la "X" isolata lontana dalla
                              sua voce (bug reale segnalato dall'utente). */}
                          <XStack className="service-price-group" gap="2" alignItems="center" flexWrap="wrap">
                            {/* Unità prima del prezzo, nello stesso ordine in cui la
                                vedono i clienti (Luca, docs/CHANGELOG.md §399). */}
                            <select
                              aria-label={`Il prezzo di ${label} è`}
                              value={service.priceUnit}
                              onChange={(e) => patch(index, { priceUnit: e.target.value as ServicePriceUnit })}
                              className="service-unit"
                              style={inputStyle}
                            >
                              {SERVICE_PRICE_UNITS.map((unit) => (
                                <option key={unit} value={unit}>
                                  {SERVICE_PRICE_UNIT_LABEL[unit]}
                                </option>
                              ))}
                            </select>
                            <XStack gap="2" alignItems="center" flexWrap="nowrap">
                              <input
                                aria-label={`Prezzo minimo di ${label} in euro`}
                                value={service.priceMin}
                                onChange={(e) => patch(index, { priceMin: e.target.value })}
                                placeholder="Da €"
                                inputMode="decimal"
                                className="service-price"
                                style={inputStyle}
                              />
                              <Text fontSize={13} color={brand.grafite70}>
                                a
                              </Text>
                              <input
                                aria-label={`Prezzo massimo di ${label} in euro`}
                                value={service.priceMax}
                                onChange={(e) => patch(index, { priceMax: e.target.value })}
                                placeholder="A €"
                                inputMode="decimal"
                                className="service-price"
                                style={inputStyle}
                              />
                              <RemoveButton label={service.name.trim() ? `Rimuovi ${service.name.trim()}` : "Rimuovi prestazione"} onPress={() => remove(index)} />
                            </XStack>
                          </XStack>
                          {service.name.trim() ? (
                            <button type="button" style={linkButtonStyle} onClick={() => patch(index, { open: false })}>
                              Fatto
                            </button>
                          ) : null}
                        </YStack>
                      ) : (
                        <XStack className="service-line" gap="3" alignItems="center" flexWrap="wrap">
                          <XStack className="service-line-name" flex={1} minWidth={180} gap="2" alignItems="center" flexWrap="wrap">
                            <Text fontSize={16} fontWeight="600" color={brand.grafite}>
                              {service.name.trim()}
                            </Text>
                            {service.fresh ? (
                              <Text fontSize={12} fontWeight="700" color={brand.cianografiaScuro} backgroundColor={brand.cianografiaVelo} paddingHorizontal="2" paddingVertical={2} borderRadius={6}>
                                Nuova
                              </Text>
                            ) : null}
                          </XStack>
                          <XStack gap="2" alignItems="center">
                            <Text fontSize={15} color={summary ? brand.grafite : brand.grafite70}>
                              {summary ?? "Prezzo su richiesta"}
                            </Text>
                            <button type="button" style={linkButtonStyle} aria-label={`${summary ? "Modifica" : "Aggiungi il prezzo di"} ${service.name.trim()}`} onClick={() => patch(index, { open: true })}>
                              {summary ? "Modifica" : "+ Prezzo"}
                            </button>
                            <RemoveButton label={`Rimuovi ${service.name.trim()}`} onPress={() => remove(index)} />
                          </XStack>
                        </XStack>
                      )}
                    </YStack>
                  );
                })}
              </YStack>
            ) : null}

            {full ? null : (
              <Button variant="ghost" size="3" height={40} alignSelf="flex-start" onPress={() => add("", group.slug, true)}>
                {group.rows.length > 0 || group.suggested.length > 0 ? "+ Scrivi un'altra prestazione" : "+ Aggiungi prestazione"}
              </Button>
            )}
          </YStack>
        );
      })}
    </>
  );
}

function RemoveButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <XStack
      width={36}
      height={36}
      flexShrink={0}
      borderRadius="2"
      borderWidth={1}
      borderColor={brand.urgenza}
      backgroundColor={brand.urgenzaVelo}
      alignItems="center"
      justifyContent="center"
      cursor="pointer"
      onPress={onPress}
      role="button"
      aria-label={label}
    >
      <X size={16} strokeWidth={2} color={brand.urgenza} />
    </XStack>
  );
}
