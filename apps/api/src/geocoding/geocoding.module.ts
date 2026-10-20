import { Global, Module } from "@nestjs/common";
import { GeocodingService } from "./geocoding.service";
import { AddressSuggestionsController } from "./address-suggestions.controller";
import { AddressSuggestionsService } from "./address-suggestions.service";
import { StaticMapController } from "./static-map.controller";
import { StaticMapService } from "./static-map.service";

@Global()
@Module({
  controllers: [AddressSuggestionsController, StaticMapController],
  providers: [GeocodingService, AddressSuggestionsService, StaticMapService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
