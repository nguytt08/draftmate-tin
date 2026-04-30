-- CreateEnum
CREATE TYPE "DraftFormat" AS ENUM ('SNAKE', 'LINEAR', 'AUCTION');

-- CreateEnum
CREATE TYPE "AutoPickBehavior" AS ENUM ('RANDOM', 'SKIP', 'BEST_RANKED');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TimerJobStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'FIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "League" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "commissionerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "League_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftSettings" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "format" "DraftFormat" NOT NULL DEFAULT 'SNAKE',
    "totalRounds" INTEGER NOT NULL,
    "pickTimerSeconds" INTEGER NOT NULL DEFAULT 43200,
    "autoPick" "AutoPickBehavior" NOT NULL DEFAULT 'RANDOM',
    "allowTrading" BOOLEAN NOT NULL DEFAULT false,
    "extendedConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DraftSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeagueMember" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "userId" TEXT,
    "inviteEmail" TEXT NOT NULL,
    "inviteToken" TEXT,
    "inviteStatus" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "draftPosition" INTEGER,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeagueMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DraftItem" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "metadata" JSONB,
    "commissionerNotes" TEXT,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberItemNote" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberItemNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "leagueId" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING',
    "currentPickNumber" INTEGER NOT NULL DEFAULT 1,
    "currentRound" INTEGER NOT NULL DEFAULT 1,
    "currentMemberId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pick" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "userId" TEXT,
    "itemId" TEXT NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "round" INTEGER NOT NULL,
    "positionInRound" INTEGER NOT NULL,
    "isAutoPick" BOOLEAN NOT NULL DEFAULT false,
    "pickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PickTimerJob" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "bullJobId" TEXT NOT NULL,
    "pickNumber" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "TimerJobStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PickTimerJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DraftSettings_leagueId_key" ON "DraftSettings"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueMember_inviteToken_key" ON "LeagueMember"("inviteToken");

-- CreateIndex
CREATE INDEX "LeagueMember_leagueId_idx" ON "LeagueMember"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueMember_leagueId_userId_key" ON "LeagueMember"("leagueId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "LeagueMember_leagueId_draftPosition_key" ON "LeagueMember"("leagueId", "draftPosition");

-- CreateIndex
CREATE INDEX "DraftItem_leagueId_isAvailable_idx" ON "DraftItem"("leagueId", "isAvailable");

-- CreateIndex
CREATE INDEX "MemberItemNote_memberId_idx" ON "MemberItemNote"("memberId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberItemNote_memberId_itemId_key" ON "MemberItemNote"("memberId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_leagueId_key" ON "Draft"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "Pick_itemId_key" ON "Pick"("itemId");

-- CreateIndex
CREATE INDEX "Pick_draftId_idx" ON "Pick"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "Pick_draftId_pickNumber_key" ON "Pick"("draftId", "pickNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PickTimerJob_bullJobId_key" ON "PickTimerJob"("bullJobId");

-- CreateIndex
CREATE INDEX "PickTimerJob_draftId_idx" ON "PickTimerJob"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "PickTimerJob_draftId_pickNumber_key" ON "PickTimerJob"("draftId", "pickNumber");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "League" ADD CONSTRAINT "League_commissionerId_fkey" FOREIGN KEY ("commissionerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftSettings" ADD CONSTRAINT "DraftSettings_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeagueMember" ADD CONSTRAINT "LeagueMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DraftItem" ADD CONSTRAINT "DraftItem_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberItemNote" ADD CONSTRAINT "MemberItemNote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "LeagueMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberItemNote" ADD CONSTRAINT "MemberItemNote_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DraftItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "League"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pick" ADD CONSTRAINT "Pick_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pick" ADD CONSTRAINT "Pick_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "LeagueMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pick" ADD CONSTRAINT "Pick_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pick" ADD CONSTRAINT "Pick_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "DraftItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PickTimerJob" ADD CONSTRAINT "PickTimerJob_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
