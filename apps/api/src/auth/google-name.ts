/** Campi del profilo presenti nel token di Google Sign-In (scope `profile`). */
export type GoogleProfile = { name?: string; given_name?: string; family_name?: string };

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Nome e cognome separati per un nuovo account Google. Google li fornisce già
 * divisi (`given_name`/`family_name`): non si spezza mai `name` sugli spazi,
 * sbaglierebbe con i nomi doppi ("Maria Grazia") e i cognomi composti ("De
 * Luca"). Se manca `given_name` si ricade sul nome completo, come prima.
 * La data di nascita non è nel token: resta da compilare in /account.
 */
export function googleNameFields(profile: GoogleProfile): { name: string | null; surname: string | null } {
  const given = clean(profile.given_name);
  if (!given) return { name: clean(profile.name), surname: null };
  return { name: given, surname: clean(profile.family_name) };
}

/**
 * Correzione per gli account creati con Google prima della separazione: il
 * cognome è vuoto e il nome è ancora il nome completo di Google. Se l'utente
 * ha già modificato nome o cognome non si tocca nulla.
 */
export function googleNameRepair(
  user: { name: string | null; surname: string | null },
  profile: GoogleProfile,
): { name?: string; surname?: string } | null {
  if (clean(user.surname ?? undefined)) return null;
  const fields = googleNameFields(profile);
  if (!fields.surname || !fields.name) return null;
  const currentName = clean(user.name ?? undefined);
  if (currentName && currentName !== clean(profile.name)) return null;
  return { name: fields.name, surname: fields.surname };
}
