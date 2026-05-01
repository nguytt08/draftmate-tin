-- AlterTable: set new default now that COMMISSIONER_PICK is committed
ALTER TABLE "DraftSettings" ALTER COLUMN "autoPick" SET DEFAULT 'COMMISSIONER_PICK';
