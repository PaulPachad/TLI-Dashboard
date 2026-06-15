CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'CLIENT',
    "clientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "email" TEXT NOT NULL,
    "title" TEXT,
    "signature" TEXT,
    "linkedinUrl" TEXT,
    "schedulingLink" TEXT,
    "defaultHashtags" TEXT DEFAULT '#AuthorityMagazine #ThoughtLeadership #Leadership #Interview',
    "defaultSignoff" TEXT DEFAULT 'Warmly',
    "replyToEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SheetSource" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sheetUrl" TEXT NOT NULL,
    "spreadsheetId" TEXT NOT NULL,
    "gid" TEXT,
    "sheetTitle" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SheetSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Interview" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "sheetSourceId" TEXT,
    "sourceRowNumber" INTEGER,
    "sourceRowHash" TEXT,
    "intervieweeName" TEXT NOT NULL,
    "intervieweeCompany" TEXT,
    "intervieweeEmail" TEXT,
    "intervieweeTitle" TEXT,
    "publicistName" TEXT,
    "publicistEmail" TEXT,
    "topic" TEXT,
    "articleUrl" TEXT NOT NULL,
    "buzzfeedUrl" TEXT,
    "interviewDocUrl" TEXT,
    "image1Url" TEXT,
    "image2Url" TEXT,
    "extraImagesUrl" TEXT,
    "videoUrl" TEXT,
    "linkedinUrl" TEXT,
    "twitterUrl" TEXT,
    "liveEmailStatusImported" TEXT,
    "pressFollowupStatusImported" TEXT,
    "estimatedPublishDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Interview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Action" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "interviewId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "recipient" TEXT,
    "cc" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "generatedText" TEXT,
    "linkedinPostUrl" TEXT,
    "metadataJson" JSONB,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Action_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "SheetSource_clientId_idx" ON "SheetSource"("clientId");
CREATE INDEX "Interview_clientId_idx" ON "Interview"("clientId");
CREATE INDEX "Interview_sheetSourceId_idx" ON "Interview"("sheetSourceId");
CREATE UNIQUE INDEX "Interview_sheetSourceId_sourceRowNumber_key" ON "Interview"("sheetSourceId", "sourceRowNumber");
CREATE UNIQUE INDEX "Interview_clientId_articleUrl_key" ON "Interview"("clientId", "articleUrl");
CREATE INDEX "Action_interviewId_idx" ON "Action"("interviewId");
CREATE INDEX "Action_clientId_idx" ON "Action"("clientId");
CREATE INDEX "Action_actionType_idx" ON "Action"("actionType");

ALTER TABLE "User" ADD CONSTRAINT "User_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SheetSource" ADD CONSTRAINT "SheetSource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Interview" ADD CONSTRAINT "Interview_sheetSourceId_fkey" FOREIGN KEY ("sheetSourceId") REFERENCES "SheetSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Action" ADD CONSTRAINT "Action_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Action" ADD CONSTRAINT "Action_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Action" ADD CONSTRAINT "Action_interviewId_fkey" FOREIGN KEY ("interviewId") REFERENCES "Interview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
