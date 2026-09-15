-- Message templates an administrator writes for supervisors to reuse.
CREATE TABLE "MessageTemplate" (
    "id"        TEXT NOT NULL,
    "title"     TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "mode"      TEXT NOT NULL DEFAULT 'NAMED',
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MessageTemplate_isActive_idx" ON "MessageTemplate"("isActive");
