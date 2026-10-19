import { Global, Module } from "@nestjs/common";
import { GeocodingService } from "./geocoding.service";
import { AddressSuggestionsController } from "./address-suggestions.controller";
import { AddressSuggestionsService } from "./address-suggestions.service";

@Global()
@Module({
  controllers: [AddressSuggestionsController],
  providers: [GeocodingService, AddressSuggestionsService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
