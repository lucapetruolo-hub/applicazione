/**
 * Suggerimenti di indirizzo chiesti a Google dal nostro server (docs/CHANGELOG.md
 * §264): il browser non carica niente di Google, quindi funzionano per tutti,
 * senza consenso ai cookie.
 */
export type AddressSuggestion = { id: string; main: string; secondary: string };

export type AddressPlace = {
  /** Indirizzo formattato da Google, senza ", Italia" finale. */
  address: string;
  latitude: number;
  longitude: number;
  /** Comune (componente "administrative_area_level_3", altrimenti "locality"). */
  comune: string | null;
  /** Località, che può essere una frazione del comune. */
  locality: string | null;
  street: string | null;
  houseNumber: string | null;
  postalCode: string | null;
  /** Sigla della provincia (es. "RM"). */
  province: string | null;
};
