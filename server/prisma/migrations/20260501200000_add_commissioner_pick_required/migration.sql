-- AlterTable
ALTER TABLE "Draft" ADD COLUMN IF NOT EXISTS "commissionerPickRequired" BOOLEAN NOT NULL DEFAULT false;
