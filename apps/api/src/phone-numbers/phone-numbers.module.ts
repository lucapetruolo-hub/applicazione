import { Module } from "@nestjs/common";
import { PhoneNumbersNormalizeService } from "./phone-numbers-normalize.service";

@Module({
  providers: [PhoneNumbersNormalizeService],
})
export class PhoneNumbersModule {}
