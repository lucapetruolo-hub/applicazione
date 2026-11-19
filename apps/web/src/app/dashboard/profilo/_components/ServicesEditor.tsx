"use client";

import { useEffect, useId, useRef, useState, type Dispatch, type KeyboardEvent, type SetStateAction } from "react";
import { Search, X } from "lucide-react";
import {
  MAX_PROFESSIONAL_SERVICES,
  PROFESSIONAL_CATEGORIES,
  SERVICE_PRICE_UNITS,
  SERVICE_PRICE_UNIT_LABEL,
  canonicalServiceName,
  formatServicePrice,
  similarServiceName,
  type ProfessionalCategorySlug,
  type ServicePriceUnit,
} from "@professionisti/shared";
import { Button, Text, XStack, YStack, brand } from "@professionisti/ui";
import { CategoryIconBadge } from "@/components/CategoryIconBadge";

/**
 * Prestazioni offerte nel profilo (docs/changelog/2026-11-17-prestazioni-veloci.md):
 * una riga che spiega perché aggiungerne tante e righe compatte con il prezzo
 * che si apre solo se serve. La casella "Aggiungi più lavori insieme" è stata
 * tolta su richiesta di Luca (docs/changelog/2026-11-19-togli-piu-lavori-insieme.md):
 * si aggiunge dai "Più cercati" o con "+ Scrivi un'altra prestazione".
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
  invalidPrice,
}: {
  services: EditableService[];
  setServices: Dispatch<SetStateAction<EditableService[]>>;
  categorySlugs: ProfessionalCategorySlug[];
  suggestedFor: (slug: ProfessionalCategorySlug) => string[];
  serviceCategory: (service: EditableService) => ProfessionalCategorySlug | undefined;
  datalistNames: string[];
  /** Prezzo sbagliato dopo "Salva profilo": bordo rosso finché non è corretto. */
  invalidPrice?: { index: number; which: "min" | "max" } | null;
}) {
  const [showAllSuggested, setShowAllSuggested] = useState<Record<string, boolean>>({});
  const [showMore, setShowMore] = useState(false);
  const ids = useId();
  // Dopo un tocco su un "Più cercato" il cursore va sul prezzo della riga nuova
  // (docs/changelog/2026-11-19-togli-piu-lavori-insieme.md).
  const focusPriceOf = useRef<number | null>(null);
  useEffect(() => {
    if (focusPriceOf.current === null) return;
    const input = document.getElementById(`${ids}-prezzo-${focusPriceOf.current}`);
    focusPriceOf.current = null;
    if (!(input instanceof HTMLInputElement)) return;
    input.focus({ preventScroll: true });
    input.scrollIntoView({ block: "nearest" });
  });
  const moreId = `${ids}-scopri`;

  const named = services.filter((service) => service.name.trim()).length;
  const full = services.length >= MAX_PROFESSIONAL_SERVICES;

  const priceInvalid = (index: number, which: "min" | "max") => (invalidPrice?.index === index && invalidPrice.which === which) || undefined;
  function patch(index: number, change: Partial<EditableService>) {
    setServices((prev) => prev.map((service, i) => (i === index ? { ...service, ...change } : service)));
  }
  /** Invio in un campo prezzo chiude la riga come "Fatto", senza inviare il modulo. */
  function closeOnEnter(e: KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (services[index]?.name.trim()) patch(index, { open: false });
  }
  function remove(index: number) {
    setServices((prev) => prev.filter((_, i) => i !== index));
  }
  function add(name: string, categorySlug: ProfessionalCategorySlug | null, open = false) {
    if (full) return;
    setServices((prev) => [...prev, { name, priceMin: "", priceMax: "", priceUnit: "JOB", categorySlug, open, fresh: true }]);
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
                      onPress={() => {
                        if (full) return;
                        focusPriceOf.current = services.length;
                        add(name, group.slug, true);
                      }}
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
                  // Avviso solo sulla seconda delle due: il professionista decide quale tenere.
                  const similar = service.name.trim() ? similarServiceName(service.name, services.slice(0, index).map((other) => other.name)) : undefined;
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
                                id={`${ids}-prezzo-${index}`}
                                aria-label={`Prezzo minimo di ${label} in euro`}
                                value={service.priceMin}
                                onChange={(e) => patch(index, { priceMin: e.target.value })}
                                onKeyDown={(e) => closeOnEnter(e, index)}
                                enterKeyHint="done"
                                placeholder="Da €"
                                inputMode="decimal"
                                className="service-price"
                                aria-invalid={priceInvalid(index, "min")}
                                style={priceInvalid(index, "min") ? { ...inputStyle, borderColor: brand.urgenza } : inputStyle}
                              />
                              <Text fontSize={13} color={brand.grafite70}>
                                a
                              </Text>
                              <input
                                aria-label={`Prezzo massimo di ${label} in euro`}
                                value={service.priceMax}
                                onChange={(e) => patch(index, { priceMax: e.target.value })}
                                onKeyDown={(e) => closeOnEnter(e, index)}
                                enterKeyHint="done"
                                placeholder="A €"
                                inputMode="decimal"
                                className="service-price"
                                aria-invalid={priceInvalid(index, "max")}
                                style={priceInvalid(index, "max") ? { ...inputStyle, borderColor: brand.urgenza } : inputStyle}
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
                      {similar ? (
                        <Text fontSize={14} color={brand.grafite70}>
                          Sembra uguale a &quot;{similar.trim()}&quot;: se è lo stesso lavoro, tienine uno solo.
                        </Text>
                      ) : null}
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
