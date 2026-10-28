import { Module } from "@nestjs/common";
import { ServiceNamesService } from "./service-names.service";

/**
 * Nomi delle prestazioni (§392), a parte perché li usano sia l'abbinamento
 * del problema sia la ricerca e il "Quanto costa" (docs/changelog/2026-10-28-quanto-costa-sinonimi.md): una sola istanza,
 * così un'unione fatta dall'admin vale subito ovunque.
 */
@Module({
  providers: [ServiceNamesService],
  exports: [ServiceNamesService],
})
export class ServiceNamesModule {}
