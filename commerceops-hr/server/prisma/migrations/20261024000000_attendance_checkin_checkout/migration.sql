-- AlterEnum
ALTER TYPE "AttendanceStatus" ADD VALUE 'MISSING_CHECKOUT';

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "correctedAt" TIMESTAMP(3),
ADD COLUMN     "correctedById" TEXT,
ADD COLUMN     "correctionReason" TEXT;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

