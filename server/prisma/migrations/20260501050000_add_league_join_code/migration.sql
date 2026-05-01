-- AlterTable
ALTER TABLE "League" ADD COLUMN "joinCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "League_joinCode_key" ON "League"("joinCode");
