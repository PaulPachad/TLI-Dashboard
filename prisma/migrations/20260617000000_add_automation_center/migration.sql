-- CreateTable
CREATE TABLE "AutomationProfile" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "name" TEXT NOT NULL DEFAULT 'Authority Magazine Automation',
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "globalKillSwitch" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'DRAFT_ONLY',
    "checkIntervalSeconds" INTEGER NOT NULL DEFAULT 120,
    "maxEmailsPerRun" INTEGER NOT NULL DEFAULT 30,
    "matchThreshold" INTEGER NOT NULL DEFAULT 90,
    "multipleChoiceGap" INTEGER NOT NULL DEFAULT 6,
    "maxMatches" INTEGER NOT NULL DEFAULT 3,
    "activeTopicLimit" INTEGER,
    "topicSourceType" TEXT NOT NULL DEFAULT 'LOCAL_JSON',
    "topicSourceUrl" TEXT,
    "formSheetUrl" TEXT,
    "blockedSendersJson" JSONB,
    "blockedDomainsJson" JSONB,
    "skipPhrasesJson" JSONB,
    "configVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationMailbox" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "clientId" TEXT,
    "label" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "workflowType" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "authStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "bridgeStatus" TEXT NOT NULL DEFAULT 'NEVER_CONNECTED',
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "bridgeTokenHash" TEXT,
    "bridgeTokenPreview" TEXT,
    "bridgeTokenRotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationMailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationTemplate" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "allowedVariablesJson" JSONB,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRule" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationRun" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "mailboxId" TEXT,
    "trigger" TEXT NOT NULL DEFAULT 'BRIDGE',
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "emailsScanned" INTEGER NOT NULL DEFAULT 0,
    "draftsCreated" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutomationDraftLog" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "mailboxId" TEXT,
    "runId" TEXT,
    "workflowType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT_CREATED',
    "recipient" TEXT,
    "subject" TEXT,
    "gmailThreadId" TEXT,
    "gmailMessageId" TEXT,
    "matchedTopic" TEXT,
    "matchedUrl" TEXT,
    "matchScore" INTEGER,
    "templateKey" TEXT,
    "configVersion" INTEGER,
    "reason" TEXT,
    "snippet" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationDraftLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearnedRule" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "originalTopic" TEXT NOT NULL,
    "normalizedTopic" TEXT NOT NULL,
    "correctTopicName" TEXT NOT NULL,
    "correctDocId" TEXT,
    "matchType" TEXT NOT NULL DEFAULT 'learned',
    "source" TEXT NOT NULL DEFAULT 'local_autoresponder',
    "confidence" INTEGER,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LearnedRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "reason" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationProfile_clientId_idx" ON "AutomationProfile"("clientId");
CREATE UNIQUE INDEX "AutomationMailbox_bridgeTokenHash_key" ON "AutomationMailbox"("bridgeTokenHash");
CREATE UNIQUE INDEX "AutomationMailbox_profileId_emailAddress_key" ON "AutomationMailbox"("profileId", "emailAddress");
CREATE INDEX "AutomationMailbox_profileId_idx" ON "AutomationMailbox"("profileId");
CREATE INDEX "AutomationMailbox_clientId_idx" ON "AutomationMailbox"("clientId");
CREATE UNIQUE INDEX "AutomationTemplate_profileId_templateKey_key" ON "AutomationTemplate"("profileId", "templateKey");
CREATE INDEX "AutomationTemplate_profileId_idx" ON "AutomationTemplate"("profileId");
CREATE INDEX "AutomationRule_profileId_idx" ON "AutomationRule"("profileId");
CREATE INDEX "AutomationRule_ruleType_idx" ON "AutomationRule"("ruleType");
CREATE INDEX "AutomationRun_profileId_idx" ON "AutomationRun"("profileId");
CREATE INDEX "AutomationRun_mailboxId_idx" ON "AutomationRun"("mailboxId");
CREATE INDEX "AutomationRun_status_idx" ON "AutomationRun"("status");
CREATE INDEX "AutomationRun_startedAt_idx" ON "AutomationRun"("startedAt");
CREATE INDEX "AutomationDraftLog_profileId_idx" ON "AutomationDraftLog"("profileId");
CREATE INDEX "AutomationDraftLog_mailboxId_idx" ON "AutomationDraftLog"("mailboxId");
CREATE INDEX "AutomationDraftLog_runId_idx" ON "AutomationDraftLog"("runId");
CREATE INDEX "AutomationDraftLog_gmailThreadId_idx" ON "AutomationDraftLog"("gmailThreadId");
CREATE INDEX "AutomationDraftLog_createdAt_idx" ON "AutomationDraftLog"("createdAt");
CREATE UNIQUE INDEX "LearnedRule_profileId_normalizedTopic_key" ON "LearnedRule"("profileId", "normalizedTopic");
CREATE INDEX "LearnedRule_profileId_idx" ON "LearnedRule"("profileId");
CREATE UNIQUE INDEX "SuppressionEntry_profileId_kind_value_key" ON "SuppressionEntry"("profileId", "kind", "value");
CREATE INDEX "SuppressionEntry_profileId_idx" ON "SuppressionEntry"("profileId");

-- AddForeignKey
ALTER TABLE "AutomationProfile" ADD CONSTRAINT "AutomationProfile_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationMailbox" ADD CONSTRAINT "AutomationMailbox_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AutomationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationMailbox" ADD CONSTRAINT "AutomationMailbox_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationTemplate" ADD CONSTRAINT "AutomationTemplate_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AutomationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRule" ADD CONSTRAINT "AutomationRule_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AutomationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AutomationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "AutomationMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationDraftLog" ADD CONSTRAINT "AutomationDraftLog_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AutomationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationDraftLog" ADD CONSTRAINT "AutomationDraftLog_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "AutomationMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationDraftLog" ADD CONSTRAINT "AutomationDraftLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AutomationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LearnedRule" ADD CONSTRAINT "LearnedRule_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AutomationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SuppressionEntry" ADD CONSTRAINT "SuppressionEntry_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AutomationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
