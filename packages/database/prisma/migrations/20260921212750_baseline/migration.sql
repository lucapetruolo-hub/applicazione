-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CLIENT', 'PROFESSIONAL', 'ADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PRO', 'BUSINESS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "VisibilityBoostType" AS ENUM ('BOOST_LOCALE', 'BADGE_REPUTAZIONE', 'STORIA_SUCCESSO');

-- CreateEnum
CREATE TYPE "VisibilityBoostStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELED');

-- CreateEnum
CREATE TYPE "GuidedRequestStatus" AS ENUM ('OPEN', 'MATCHED', 'CLOSED');

-- CreateEnum
CREATE TYPE "GuidedRequestClosedReason" AS ENUM ('EXPIRED', 'CANCELED_BY_CLIENT', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ServiceMode" AS ENUM ('HOME', 'ONLINE');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('PENDING', 'PAID', 'CONVERTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('SENT', 'ACCEPTED', 'REJECTED', 'MODIFICATION_REQUESTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingCanceledBy" AS ENUM ('CLIENT', 'PROFESSIONAL');

-- CreateEnum
CREATE TYPE "ExternalJobStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('LEAD', 'SUBSCRIPTION', 'VISIBILITY_BOOST');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "ConversationEventActor" AS ENUM ('CLIENT', 'PROFESSIONAL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ContactMessageRole" AS ENUM ('CLIENT', 'PROFESSIONAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentReportTargetType" AS ENUM ('PROFESSIONAL_PROFILE', 'REVIEW', 'CLIENT_REVIEW');

-- CreateEnum
CREATE TYPE "ContentReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ProfessionalEntityType" AS ENUM ('PRIVATE_INDIVIDUAL', 'SOLE_PROPRIETOR', 'BUSINESS');

-- CreateEnum
CREATE TYPE "FiscalVerificationStatus" AS ENUM ('UNVERIFIED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'REQUIRES_UPDATE');

-- CreateEnum
CREATE TYPE "JobPaymentMethod" AS ENUM ('MANOVIA', 'DIRECT');

-- CreateEnum
CREATE TYPE "JobPaymentStatus" AS ENUM ('PENDING', 'AWAITING_CONFIRMATION', 'CONFIRMED', 'DISPUTED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "ManoviaRevenueSource" AS ENUM ('JOB_COMMISSION', 'SUBSCRIPTION', 'VISIBILITY_BOOST', 'LEAD');

-- CreateEnum
CREATE TYPE "Dac7ReportingStatus" AS ENUM ('OPEN', 'DATA_COLLECTION', 'VALIDATION', 'READY', 'EXPORTED', 'SUBMITTED', 'REJECTED', 'CORRECTED');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('MANOVIA_TO_PROFESSIONAL', 'PROFESSIONAL_TO_CLIENT');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'VOID');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED_CLIENT', 'RESOLVED_PROFESSIONAL', 'CLOSED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
    "email" TEXT,
    "passwordHash" TEXT,
    "phone" TEXT,
    "googleId" TEXT,
    "name" TEXT,
    "surname" TEXT,
    "birthDate" TIMESTAMP(3),
    "imageUrl" TEXT,
    "street" TEXT,
    "houseNumber" TEXT,
    "addressExtra" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "province" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "legalConsentAt" TIMESTAMP(3),
    "legalConsentVersion" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "subTags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "subTags" TEXT[],
    "businessName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "bio" TEXT,
    "address" TEXT,
    "imageUrl" TEXT,
    "portfolioUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "remoteAvailable" BOOLEAN NOT NULL DEFAULT false,
    "engagementRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "urgentEngagementRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 25,
    "spokenLanguages" TEXT[] DEFAULT ARRAY['Italiano']::TEXT[],
    "yearsOfExperience" INTEGER,
    "certifications" TEXT,
    "hasLiabilityInsurance" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "professional_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_metrics" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "avgResponseTimeMinutes" DOUBLE PRECISION,
    "totalResponsesMeasured" INTEGER NOT NULL DEFAULT 0,
    "totalRequestsReceived" INTEGER NOT NULL DEFAULT 0,
    "acceptedRequests" INTEGER NOT NULL DEFAULT 0,
    "completedJobs" INTEGER NOT NULL DEFAULT 0,
    "acceptedJobs" INTEGER NOT NULL DEFAULT 0,
    "avgRating" DOUBLE PRECISION,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "honoredAppointments" INTEGER NOT NULL DEFAULT 0,
    "totalAppointments" INTEGER NOT NULL DEFAULT 0,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reliabilityScore" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_services" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMinEurCents" INTEGER,
    "priceMaxEurCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "professional_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_slots" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "allowsHome" BOOLEAN NOT NULL DEFAULT true,
    "allowsOnline" BOOLEAN NOT NULL DEFAULT false,
    "homeMaxBookings" INTEGER,
    "onlineMaxBookings" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "availability_exceptions" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_professionals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visibility_boosts" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "type" "VisibilityBoostType" NOT NULL,
    "status" "VisibilityBoostStatus" NOT NULL DEFAULT 'ACTIVE',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "stripePaymentId" TEXT,

    CONSTRAINT "visibility_boosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guided_requests" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photoUrls" TEXT[],
    "city" TEXT NOT NULL,
    "address" TEXT,
    "recipientName" TEXT,
    "recipientSurname" TEXT,
    "recipientPhone" TEXT,
    "houseNumber" TEXT,
    "addressExtra" TEXT,
    "postalCode" TEXT,
    "province" TEXT,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "serviceMode" "ServiceMode",
    "status" "GuidedRequestStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "preferredDate" TIMESTAMP(3),
    "preferredTimeSlot" TEXT,
    "professionalProfileId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "closedReason" "GuidedRequestClosedReason",
    "reserveCandidateIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "guided_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "guidedRequestId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "priceEurCents" INTEGER NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'PENDING',
    "declineNote" TEXT,
    "professionalNote" TEXT,
    "expiresAt" TIMESTAMP(3),
    "wasExpanded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "guidedRequestId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "estimatedStartDate" TIMESTAMP(3) NOT NULL,
    "estimatedEndDate" TIMESTAMP(3),
    "clientProposedDate" TIMESTAMP(3),
    "clientProposedEndDate" TIMESTAMP(3),
    "clientProposedNote" TEXT,
    "professionalCounterNote" TEXT,
    "notes" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'SENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceMinEurCents" INTEGER,
    "priceMaxEurCents" INTEGER,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT,
    "clientId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3),
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recipientName" TEXT,
    "recipientSurname" TEXT,
    "recipientPhone" TEXT,
    "street" TEXT,
    "houseNumber" TEXT,
    "addressExtra" TEXT,
    "postalCode" TEXT,
    "city" TEXT,
    "province" TEXT,
    "finalAmountEurCents" INTEGER,
    "professionalCompletionPhotoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clientCompletionPhotoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "clientConfirmedCompletedAt" TIMESTAMP(3),
    "cancellationNote" TEXT,
    "canceledBy" "BookingCanceledBy",
    "professionalNote" TEXT,
    "meetingLink" TEXT,
    "refundRequested" BOOLEAN NOT NULL DEFAULT false,
    "refundRequestedAt" TIMESTAMP(3),
    "serviceMode" "ServiceMode",

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_final_items" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceEurCents" INTEGER NOT NULL,

    CONSTRAINT "booking_final_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_jobs" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientPhone" TEXT,
    "address" TEXT,
    "description" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3),
    "priceEurCents" INTEGER,
    "notes" TEXT,
    "status" "ExternalJobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isAutomatic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "type" "PaymentType" NOT NULL,
    "amountEurCents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "stripePaymentIntentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "sentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_events" (
    "id" TEXT NOT NULL,
    "guidedRequestId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "actor" "ConversationEventActor" NOT NULL,
    "message" TEXT NOT NULL,
    "mediaUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waitlist_signups" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waitlist_signups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_messages" (
    "id" TEXT NOT NULL,
    "role" "ContactMessageRole" NOT NULL,
    "email" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_reports" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetType" "ContentReportTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ContentReportStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,

    CONSTRAINT "content_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "professional_fiscal_profiles" (
    "id" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "entityType" "ProfessionalEntityType",
    "fiscalFirstName" TEXT,
    "fiscalLastName" TEXT,
    "fiscalCodiceFiscale" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "placeOfBirth" TEXT,
    "countryOfBirth" TEXT,
    "businessName" TEXT,
    "legalForm" TEXT,
    "vatNumber" TEXT,
    "businessRegistrationNumber" TEXT,
    "leiCode" TEXT,
    "additionalEuStates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "taxResidenceCountry" TEXT,
    "foreignTin" TEXT,
    "fiscalIdIssuingCountry" TEXT,
    "registeredStreet" TEXT,
    "registeredHouseNumber" TEXT,
    "registeredCity" TEXT,
    "registeredPostalCode" TEXT,
    "registeredProvince" TEXT,
    "registeredCountry" TEXT,
    "verificationStatus" "FiscalVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verificationNote" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "fiscalDeclarationAcceptedAt" TIMESTAMP(3),
    "fiscalDeclarationVersion" TEXT,
    "stripeConnectAccountId" TEXT,
    "stripeChargesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripePayoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "stripeRequirementsStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "professional_fiscal_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_representatives" (
    "id" TEXT NOT NULL,
    "fiscalProfileId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "codiceFiscale" TEXT,
    "role" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fiscal_representatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_payments" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "paymentMethod" "JobPaymentMethod" NOT NULL,
    "status" "JobPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "grossAmountEurCents" INTEGER NOT NULL,
    "platformFeeEurCents" INTEGER NOT NULL DEFAULT 0,
    "netAmountEurCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "appliedFeeRuleId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeTransferId" TEXT,
    "directReportedAt" TIMESTAMP(3),
    "directReportedById" TEXT,
    "directConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_fee_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "percentageBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "fixedFeeEurCents" INTEGER NOT NULL DEFAULT 0,
    "minFeeEurCents" INTEGER,
    "maxFeeEurCents" INTEGER,
    "categoryId" TEXT,
    "professionalProfileId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_fee_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manovia_revenue" (
    "id" TEXT NOT NULL,
    "source" "ManoviaRevenueSource" NOT NULL,
    "amountEurCents" INTEGER NOT NULL,
    "professionalProfileId" TEXT,
    "jobPaymentId" TEXT,
    "subscriptionId" TEXT,
    "visibilityBoostId" TEXT,
    "paymentId" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "manovia_revenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dac7_reporting_periods" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER,
    "status" "Dac7ReportingStatus" NOT NULL DEFAULT 'OPEN',
    "reportVersion" INTEGER NOT NULL DEFAULT 1,
    "generatedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "exportFileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dac7_reporting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dac7_records" (
    "id" TEXT NOT NULL,
    "reportingPeriodId" TEXT NOT NULL,
    "professionalProfileId" TEXT NOT NULL,
    "considerationEurCents" INTEGER NOT NULL DEFAULT 0,
    "numberOfTransactions" INTEGER NOT NULL DEFAULT 0,
    "feesWithheldEurCents" INTEGER NOT NULL DEFAULT 0,
    "missingFiscalData" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dac7_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_dac7_settings" (
    "id" TEXT NOT NULL,
    "sendingEntityIn" TEXT,
    "platformName" TEXT,
    "platformIdValue" TEXT,
    "platformIdType" TEXT NOT NULL DEFAULT 'OECD201',
    "transmittingCountry" TEXT NOT NULL DEFAULT 'IT',
    "receivingCountry" TEXT NOT NULL DEFAULT 'IT',
    "messageSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_dac7_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dac7_rules" (
    "id" TEXT NOT NULL,
    "includeDirectPayments" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dac7_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "type" "InvoiceType" NOT NULL,
    "jobPaymentId" TEXT,
    "professionalProfileId" TEXT NOT NULL,
    "amountEurCents" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "documentUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "jobPaymentId" TEXT NOT NULL,
    "amountEurCents" INTEGER NOT NULL,
    "reason" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "stripeRefundId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "jobPaymentId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldName" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedByUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "professional_profiles_userId_key" ON "professional_profiles"("userId");

-- CreateIndex
CREATE INDEX "professional_profiles_categoryId_city_idx" ON "professional_profiles"("categoryId", "city");

-- CreateIndex
CREATE UNIQUE INDEX "professional_metrics_professionalProfileId_key" ON "professional_metrics"("professionalProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "availability_exceptions_professionalProfileId_date_key" ON "availability_exceptions"("professionalProfileId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "saved_professionals_userId_professionalProfileId_key" ON "saved_professionals"("userId", "professionalProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_professionalProfileId_key" ON "subscriptions"("professionalProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "visibility_boosts_professionalProfileId_status_idx" ON "visibility_boosts"("professionalProfileId", "status");

-- CreateIndex
CREATE INDEX "guided_requests_categoryId_city_status_idx" ON "guided_requests"("categoryId", "city", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leads_guidedRequestId_professionalProfileId_key" ON "leads"("guidedRequestId", "professionalProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_quoteId_key" ON "bookings"("quoteId");

-- CreateIndex
CREATE INDEX "bookings_professionalProfileId_scheduledAt_idx" ON "bookings"("professionalProfileId", "scheduledAt");

-- CreateIndex
CREATE INDEX "external_jobs_professionalProfileId_scheduledAt_idx" ON "external_jobs"("professionalProfileId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_bookingId_key" ON "reviews"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "client_reviews_bookingId_key" ON "client_reviews"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripePaymentIntentId_key" ON "payments"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "notifications_userId_sentAt_idx" ON "notifications"("userId", "sentAt");

-- CreateIndex
CREATE INDEX "conversation_events_guidedRequestId_professionalProfileId_c_idx" ON "conversation_events"("guidedRequestId", "professionalProfileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "waitlist_signups_email_key" ON "waitlist_signups"("email");

-- CreateIndex
CREATE INDEX "contact_messages_resolved_createdAt_idx" ON "contact_messages"("resolved", "createdAt");

-- CreateIndex
CREATE INDEX "content_reports_status_createdAt_idx" ON "content_reports"("status", "createdAt");

-- CreateIndex
CREATE INDEX "content_reports_reporterId_targetType_targetId_createdAt_idx" ON "content_reports"("reporterId", "targetType", "targetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "professional_fiscal_profiles_professionalProfileId_key" ON "professional_fiscal_profiles"("professionalProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "professional_fiscal_profiles_stripeConnectAccountId_key" ON "professional_fiscal_profiles"("stripeConnectAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "fiscal_representatives_fiscalProfileId_key" ON "fiscal_representatives"("fiscalProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "job_payments_bookingId_key" ON "job_payments"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "job_payments_stripePaymentIntentId_key" ON "job_payments"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "job_payments_stripeTransferId_key" ON "job_payments"("stripeTransferId");

-- CreateIndex
CREATE INDEX "platform_fee_rules_professionalProfileId_effectiveFrom_idx" ON "platform_fee_rules"("professionalProfileId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "platform_fee_rules_categoryId_effectiveFrom_idx" ON "platform_fee_rules"("categoryId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "manovia_revenue_source_recordedAt_idx" ON "manovia_revenue"("source", "recordedAt");

-- CreateIndex
CREATE UNIQUE INDEX "dac7_reporting_periods_year_quarter_key" ON "dac7_reporting_periods"("year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "dac7_records_reportingPeriodId_professionalProfileId_key" ON "dac7_records"("reportingPeriodId", "professionalProfileId");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_profiles" ADD CONSTRAINT "professional_profiles_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_metrics" ADD CONSTRAINT "professional_metrics_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_services" ADD CONSTRAINT "professional_services_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "availability_exceptions" ADD CONSTRAINT "availability_exceptions_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_professionals" ADD CONSTRAINT "saved_professionals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_professionals" ADD CONSTRAINT "saved_professionals_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visibility_boosts" ADD CONSTRAINT "visibility_boosts_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guided_requests" ADD CONSTRAINT "guided_requests_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guided_requests" ADD CONSTRAINT "guided_requests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guided_requests" ADD CONSTRAINT "guided_requests_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_guidedRequestId_fkey" FOREIGN KEY ("guidedRequestId") REFERENCES "guided_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_guidedRequestId_fkey" FOREIGN KEY ("guidedRequestId") REFERENCES "guided_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_final_items" ADD CONSTRAINT "booking_final_items_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_jobs" ADD CONSTRAINT "external_jobs_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_reviews" ADD CONSTRAINT "client_reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_reviews" ADD CONSTRAINT "client_reviews_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_guidedRequestId_fkey" FOREIGN KEY ("guidedRequestId") REFERENCES "guided_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_events" ADD CONSTRAINT "conversation_events_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_fiscal_profiles" ADD CONSTRAINT "professional_fiscal_profiles_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fiscal_representatives" ADD CONSTRAINT "fiscal_representatives_fiscalProfileId_fkey" FOREIGN KEY ("fiscalProfileId") REFERENCES "professional_fiscal_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_payments" ADD CONSTRAINT "job_payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_payments" ADD CONSTRAINT "job_payments_appliedFeeRuleId_fkey" FOREIGN KEY ("appliedFeeRuleId") REFERENCES "platform_fee_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_fee_rules" ADD CONSTRAINT "platform_fee_rules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_fee_rules" ADD CONSTRAINT "platform_fee_rules_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manovia_revenue" ADD CONSTRAINT "manovia_revenue_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manovia_revenue" ADD CONSTRAINT "manovia_revenue_jobPaymentId_fkey" FOREIGN KEY ("jobPaymentId") REFERENCES "job_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dac7_records" ADD CONSTRAINT "dac7_records_reportingPeriodId_fkey" FOREIGN KEY ("reportingPeriodId") REFERENCES "dac7_reporting_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dac7_records" ADD CONSTRAINT "dac7_records_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "professional_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_jobPaymentId_fkey" FOREIGN KEY ("jobPaymentId") REFERENCES "job_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_jobPaymentId_fkey" FOREIGN KEY ("jobPaymentId") REFERENCES "job_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_jobPaymentId_fkey" FOREIGN KEY ("jobPaymentId") REFERENCES "job_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

