-- AlterTable
ALTER TABLE "DraftItem" ADD COLUMN     "bucket" TEXT;

-- AlterTable
ALTER TABLE "DraftSettings" ADD COLUMN     "enforceBucketPicking" BOOLEAN NOT NULL DEFAULT false;
