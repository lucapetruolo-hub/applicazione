import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ClientInvoiceRequestsController } from "./client-invoice-requests.controller";
import { ClientInvoiceRequestsService } from "./client-invoice-requests.service";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [ClientInvoiceRequestsController],
  providers: [ClientInvoiceRequestsService],
  exports: [ClientInvoiceRequestsService],
})
export class ClientInvoiceRequestsModule {}
