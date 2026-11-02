-- CreateEnum
CREATE TYPE "WorkLocation" AS ENUM ('OFFICE', 'HOME', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkReportStatus" AS ENUM ('COMPLETED', 'IN_PROGRESS', 'PENDING');

-- AlterTable
ALTER TABLE "attendance" ADD COLUMN     "workLocation" "WorkLocation",
ADD COLUMN     "workLocationDetail" TEXT;

-- CreateTable
CREATE TABLE "work_reports" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" "WorkReportStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "work_reports_attendanceId_idx" ON "work_reports"("attendanceId");

-- AddForeignKey
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
