CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "targetClientId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousEmail" TEXT,
    "newEmail" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditLog_targetClientId_idx" ON "AdminAuditLog"("targetClientId");
CREATE INDEX "AdminAuditLog_actorUserId_idx" ON "AdminAuditLog"("actorUserId");
CREATE INDEX "AdminAuditLog_action_idx" ON "AdminAuditLog"("action");
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_targetClientId_fkey" FOREIGN KEY ("targetClientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
