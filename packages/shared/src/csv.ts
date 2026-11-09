/**
 * Una cella di un CSV col punto e virgola (Excel in italiano).
 *
 * Controllo pre-lancio dell'08/11 (E2-06): un testo scritto da un utente che
 * comincia con `=`, `+`, `-`, `@`, tab o a capo (un nome attività, il nome
 * di un cliente, la descrizione di un lavoro) Excel lo apre come formula, che
 * può aprire link o leggere altre celle. Prende un apostrofo davanti, che
 * Excel non mostra. Gli importi ("-8,54") restano numeri.
 */
export function csvCell(raw: string): string {
  const value = /^[=+\-@\t\r]/.test(raw) && !/^-?\d+(,\d+)?$/.test(raw) ? `'${raw}` : raw;
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
