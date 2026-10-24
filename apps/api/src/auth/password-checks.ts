import { BadRequestException } from "@nestjs/common";
import { PASSWORD_CONTAINS_EMAIL_MESSAGE, passwordContainsEmail } from "@professionisti/shared";

/**
 * Password nuova che contiene l'email dell'account (docs/CHANGELOG.md §289):
 * 400. Il resto delle regole lo controlla già `newPasswordSchema`, che non
 * conosce l'email quando la password si cambia o si recupera.
 */
export function assertPasswordWithoutEmail(password: string, email: string | null | undefined): void {
  if (passwordContainsEmail(password, email)) {
    throw new BadRequestException(PASSWORD_CONTAINS_EMAIL_MESSAGE);
  }
}
