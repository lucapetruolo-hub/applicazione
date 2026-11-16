-- Indici sulle colonne di collegamento che non ne avevano: con tante righe
-- ogni pagina del gestionale leggeva l'intera tabella
-- (docs/changelog/2026-11-16-traffico-elevato.md). Solo aggiunte.
-- CreateIndex
CREATE INDEX "availability_slots_professionalProfileId_idx" ON "availability_slots"("professionalProfileId");

-- CreateIndex
CREATE INDEX "booking_final_items_bookingId_idx" ON "booking_final_items"("bookingId");

-- CreateIndex
CREATE INDEX "bookings_clientId_idx" ON "bookings"("clientId");

-- CreateIndex
CREATE INDEX "conversation_events_professionalProfileId_idx" ON "conversation_events"("professionalProfileId");

-- CreateIndex
CREATE INDEX "dac7_records_professionalProfileId_idx" ON "dac7_records"("professionalProfileId");

-- CreateIndex
CREATE INDEX "disputes_jobPaymentId_idx" ON "disputes"("jobPaymentId");

-- CreateIndex
CREATE INDEX "guided_request_user_states_guidedRequestId_idx" ON "guided_request_user_states"("guidedRequestId");

-- CreateIndex
CREATE INDEX "guided_requests_clientId_idx" ON "guided_requests"("clientId");

-- CreateIndex
CREATE INDEX "guided_requests_professionalProfileId_idx" ON "guided_requests"("professionalProfileId");

-- CreateIndex
CREATE INDEX "invoices_jobPaymentId_idx" ON "invoices"("jobPaymentId");

-- CreateIndex
CREATE INDEX "job_payments_appliedFeeRuleId_idx" ON "job_payments"("appliedFeeRuleId");

-- CreateIndex
CREATE INDEX "leads_professionalProfileId_idx" ON "leads"("professionalProfileId");

-- CreateIndex
CREATE INDEX "manovia_revenue_jobPaymentId_idx" ON "manovia_revenue"("jobPaymentId");

-- CreateIndex
CREATE INDEX "manovia_revenue_professionalProfileId_idx" ON "manovia_revenue"("professionalProfileId");

-- CreateIndex
CREATE INDEX "payments_professionalProfileId_idx" ON "payments"("professionalProfileId");

-- CreateIndex
CREATE INDEX "platform_fee_entries_jobPaymentId_idx" ON "platform_fee_entries"("jobPaymentId");

-- CreateIndex
CREATE INDEX "problem_takeovers_userId_idx" ON "problem_takeovers"("userId");

-- CreateIndex
CREATE INDEX "professional_services_professionalProfileId_idx" ON "professional_services"("professionalProfileId");

-- CreateIndex
CREATE INDEX "quote_items_quoteId_idx" ON "quote_items"("quoteId");

-- CreateIndex
CREATE INDEX "quotes_guidedRequestId_idx" ON "quotes"("guidedRequestId");

-- CreateIndex
CREATE INDEX "quotes_professionalProfileId_idx" ON "quotes"("professionalProfileId");

-- CreateIndex
CREATE INDEX "refunds_jobPaymentId_idx" ON "refunds"("jobPaymentId");

-- CreateIndex
CREATE INDEX "saved_professionals_professionalProfileId_idx" ON "saved_professionals"("professionalProfileId");
