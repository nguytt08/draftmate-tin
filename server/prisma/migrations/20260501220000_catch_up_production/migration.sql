-- Catch-up migration: idempotently applies all post-init schema changes.
-- Safe to run on a DB that was initialized via `prisma db push` instead of migrations.
-- Each statement is guarded with IF NOT EXISTS or equivalent so it's a no-op if already applied.

-- migration 2: bucket column on DraftItem, enforceBucketPicking on DraftSettings
ALTER TABLE "DraftItem" ADD COLUMN IF NOT EXISTS "bucket" TEXT;
ALTER TABLE "DraftSettings" ADD COLUMN IF NOT EXISTS "enforceBucketPicking" BOOLEAN NOT NULL DEFAULT false;

-- migration 3: displayName on LeagueMember
ALTER TABLE "LeagueMember" ADD COLUMN IF NOT EXISTS "displayName" TEXT;

-- migration 4: pickTimerSeconds default
ALTER TABLE "DraftSettings" ALTER COLUMN "pickTimerSeconds" SET DEFAULT 7200;

-- migration 5: make inviteEmail optional (idempotent in postgres)
ALTER TABLE "LeagueMember" ALTER COLUMN "inviteEmail" DROP NOT NULL;

-- migration 6: inviteExpiresAt on LeagueMember
ALTER TABLE "LeagueMember" ADD COLUMN IF NOT EXISTS "inviteExpiresAt" TIMESTAMP(3);

-- migration 7: joinCode on League
ALTER TABLE "League" ADD COLUMN IF NOT EXISTS "joinCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "League_joinCode_key" ON "League"("joinCode");

-- migration 8: isOverridePick on Pick
ALTER TABLE "Pick" ADD COLUMN IF NOT EXISTS "isOverridePick" BOOLEAN NOT NULL DEFAULT false;

-- migration 9: COMMISSIONER_PICK enum value (guard against duplicate)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'COMMISSIONER_PICK'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AutoPickBehavior')
  ) THEN
    ALTER TYPE "AutoPickBehavior" ADD VALUE 'COMMISSIONER_PICK';
  END IF;
END $$;

-- migration 10: set COMMISSIONER_PICK as default for autoPick
ALTER TABLE "DraftSettings" ALTER COLUMN "autoPick" SET DEFAULT 'COMMISSIONER_PICK';

-- migration 11: commissionerPickRequired on Draft
ALTER TABLE "Draft" ADD COLUMN IF NOT EXISTS "commissionerPickRequired" BOOLEAN NOT NULL DEFAULT false;

-- migration 12: allowSelfReclaim on DraftSettings
ALTER TABLE "DraftSettings" ADD COLUMN IF NOT EXISTS "allowSelfReclaim" BOOLEAN NOT NULL DEFAULT false;
