import { Body, Controller, Post } from "@nestjs/common";
import { waitlistSignupSchema, type WaitlistSignupInput } from "@professionisti/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { WaitlistService } from "./waitlist.service";

@Controller("waitlist")
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post()
  signup(@Body(new ZodValidationPipe(waitlistSignupSchema)) body: WaitlistSignupInput) {
    return this.waitlistService.signup(body);
  }
}
