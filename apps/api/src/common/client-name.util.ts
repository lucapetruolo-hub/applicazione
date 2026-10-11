/**
 * Nome del cliente come lo vede un professionista (richiesta esplicita
 * dell'utente, docs/CHANGELOG.md §215): prima dell'accettazione del
 * preventivo solo il nome, il cognome si sblocca insieme a telefono e
 * indirizzo quando nasce la `Booking` (CLAUDE.md §5 punto 9). Il cognome
 * viene tolto qui, lato server, così non arriva mai al browser prima.
 */
export function clientNameForProfessional(client: { name: string | null; surname: string | null }, unlocked: boolean): string | null {
  if (unlocked) return [client.name, client.surname].map((part) => part?.trim()).filter(Boolean).join(" ") || null;
  return firstName(client);
}

/**
 * Nome senza cognome. Con il cognome compilato `name` contiene solo il nome
 * (anche doppio, "Maria Grazia"). Senza cognome `name` può essere ancora il
 * nome completo (account Google creati prima della separazione, o chi ha
 * scritto tutto nel campo nome): lì si tiene solo la prima parola, così il
 * cognome non esce. Nessun dato viene modificato.
 */
function firstName(client: { name: string | null; surname: string | null }): string | null {
  const name = client.name?.trim();
  if (!name) return null;
  return client.surname?.trim() ? name : (name.split(/\s+/)[0] ?? name);
}

/**
 * Firma pubblica del cliente sulle recensioni (docs/CHANGELOG.md §215): nome
 * e iniziale del cognome ("Mario R."), mai il cognome intero a chiunque.
 */
export function publicClientName(client: { name: string | null; surname: string | null }): string | null {
  const name = firstName(client);
  if (!name) return null;
  const initial = client.surname?.trim().charAt(0).toUpperCase();
  return initial ? `${name} ${initial}.` : name;
}

/** Anni compiuti a oggi da una data di nascita (date salvate a mezzanotte UTC). */
export function ageInYears(birthDate: Date, now: Date = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < birthDate.getUTCMonth() || (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
