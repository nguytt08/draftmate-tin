-- AlterTable
ALTER TABLE "DraftItem" ADD COLUMN "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "DraftItem_leagueId_isDeleted_idx" ON "DraftItem"("leagueId", "isDeleted");
