CREATE TABLE "DraftTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "settingsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bucket" TEXT,
    "metadata" JSONB,
    "commissionerNotes" TEXT,

    CONSTRAINT "DraftTemplateItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftTemplateMember" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "draftPosition" INTEGER,

    CONSTRAINT "DraftTemplateMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DraftTemplate_creatorId_idx" ON "DraftTemplate"("creatorId");
CREATE INDEX "DraftTemplateItem_templateId_idx" ON "DraftTemplateItem"("templateId");
CREATE INDEX "DraftTemplateMember_templateId_idx" ON "DraftTemplateMember"("templateId");

ALTER TABLE "DraftTemplate" ADD CONSTRAINT "DraftTemplate_creatorId_fkey"
    FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftTemplateItem" ADD CONSTRAINT "DraftTemplateItem_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "DraftTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DraftTemplateMember" ADD CONSTRAINT "DraftTemplateMember_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "DraftTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
