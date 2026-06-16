ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "topicsSheetUrl" TEXT;

CREATE TABLE IF NOT EXISTS "Topic" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceRequests" TEXT,
    "responses" TEXT,
    "interviewQuestions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Event" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "date" TEXT,
    "location" TEXT,
    "status" TEXT,
    "contactInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Topic_clientId_idx" ON "Topic"("clientId");
CREATE INDEX IF NOT EXISTS "Event_clientId_idx" ON "Event"("clientId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Topic_clientId_fkey'
    ) THEN
        ALTER TABLE "Topic" ADD CONSTRAINT "Topic_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "Client"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Event_clientId_fkey'
    ) THEN
        ALTER TABLE "Event" ADD CONSTRAINT "Event_clientId_fkey"
        FOREIGN KEY ("clientId") REFERENCES "Client"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
