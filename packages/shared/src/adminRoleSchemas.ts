import { z } from "zod";
import "./zod";
import { adminRoles } from "./adminRoles";

// Schemi in un file a parte: `adminRoles.ts` entra in ogni pagina del sito
// (menu), zod no (collaudo N-01, docs/changelog/2026-10-30-velocita-telefono.md).

/** Assegna o toglie i ruoli admin (lista vuota = non più admin). */
export const adminRoleUpdateSchema = z.object({ adminRoles: z.array(z.enum(adminRoles)).max(3) });
export type AdminRoleUpdateInput = z.infer<typeof adminRoleUpdateSchema>;

/** "Account di prova" acceso o spento da un super admin (docs/CHANGELOG.md §395). */
export const testAccountUpdateSchema = z.object({ testAccount: z.boolean() });
export type TestAccountUpdateInput = z.infer<typeof testAccountUpdateSchema>;

/** "Fai passare il tempo" sui lavori di un account di prova (docs/changelog/2026-10-29-collaudo-tempo.md). */
export const TEST_TIME_SHIFT_MAX_DAYS = 30;
export const testTimeShiftSchema = z.object({ days: z.number().int().min(1).max(TEST_TIME_SHIFT_MAX_DAYS) });
export type TestTimeShiftInput = z.infer<typeof testTimeShiftSchema>;
