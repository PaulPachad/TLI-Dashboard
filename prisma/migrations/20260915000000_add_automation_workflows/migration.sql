-- CreateTable
CREATE TABLE "AutomationWorkflow" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Daily Generic Response',
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'PREVIEW',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "scheduleHour" INTEGER NOT NULL DEFAULT 10,
    "scheduleMinute" INTEGER NOT NULL DEFAULT 0,
    "queueLabelId" TEXT,
    "queueLabelName" TEXT,
    "templateKey" TEXT NOT NULL DEFAULT 'generic_response',
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "dailyCap" INTEGER NOT NULL DEFAULT 100,
    "batchSize" INTEGER NOT NULL DEFAULT 25,
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationWorkflowRun" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "mailboxId" TEXT,
    "workflowId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "cutoffAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "discoveryComplete" BOOLEAN NOT NULL DEFAULT false,
    "cursor" TEXT,
    "emailsScanned" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "heldCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "leaseGeneration" INTEGER NOT NULL DEFAULT 1,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationWorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationDelivery" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "runId" TEXT,
    "gmailThreadId" TEXT NOT NULL,
    "gmailMessageId" TEXT,
    "sourceMessageIdsJson" JSONB,
    "anchorInboundId" TEXT,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "templateVersion" INTEGER NOT NULL DEFAULT 1,
    "templateHash" TEXT,
    "deterministicMessageId" TEXT,
    "gmailDraftId" TEXT,
    "gmailSentId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "retryAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "cleanedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationWorkflow_profileId_idx" ON "AutomationWorkflow"("profileId");
CREATE INDEX "AutomationWorkflow_mailboxId_idx" ON "AutomationWorkflow"("mailboxId");
CREATE UNIQUE INDEX "AutomationWorkflow_mailboxId_key_key" ON "AutomationWorkflow"("mailboxId", "key");

-- CreateIndex
CREATE INDEX "AutomationWorkflowRun_profileId_idx" ON "AutomationWorkflowRun"("profileId");
CREATE INDEX "AutomationWorkflowRun_workflowId_idx" ON "AutomationWorkflowRun"("workflowId");
CREATE INDEX "AutomationWorkflowRun_status_idx" ON "AutomationWorkflowRun"("status");
CREATE INDEX "AutomationWorkflowRun_scheduledAt_idx" ON "AutomationWorkflowRun"("scheduledAt");
CREATE UNIQUE INDEX "AutomationWorkflowRun_workflowId_localDate_key" ON "AutomationWorkflowRun"("workflowId", "localDate");

-- CreateIndex
CREATE INDEX "AutomationDelivery_workflowId_state_idx" ON "AutomationDelivery"("workflowId", "state");
CREATE INDEX "AutomationDelivery_runId_idx" ON "AutomationDelivery"("runId");
CREATE INDEX "AutomationDelivery_profileId_idx" ON "AutomationDelivery"("profileId");
CREATE INDEX "AutomationDelivery_gmailThreadId_idx" ON "AutomationDelivery"("gmailThreadId");
CREATE INDEX "AutomationDelivery_createdAt_idx" ON "AutomationDelivery"("createdAt");
CREATE UNIQUE INDEX "AutomationDelivery_workflowId_gmailThreadId_key" ON "AutomationDelivery"("workflowId", "gmailThreadId");

-- AddForeignKey
ALTER TABLE "AutomationWorkflow" ADD CONSTRAINT "AutomationWorkflow_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AutomationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationWorkflow" ADD CONSTRAINT "AutomationWorkflow_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "AutomationMailbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationWorkflowRun" ADD CONSTRAINT "AutomationWorkflowRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AutomationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationWorkflowRun" ADD CONSTRAINT "AutomationWorkflowRun_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "AutomationMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationWorkflowRun" ADD CONSTRAINT "AutomationWorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "AutomationWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutomationDelivery" ADD CONSTRAINT "AutomationDelivery_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AutomationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationDelivery" ADD CONSTRAINT "AutomationDelivery_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "AutomationWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationDelivery" ADD CONSTRAINT "AutomationDelivery_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationWorkflowRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
