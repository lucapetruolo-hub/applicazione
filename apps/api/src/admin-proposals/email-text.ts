/** Il testo di un paragrafo d'email senza il grassetto (`**…**`), per l'anteprima in Admin. */
export function stripEmailMarkdown(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}
