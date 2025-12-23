-- CreateTable
CREATE TABLE "PriceSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "title" TEXT,
    "runAt" DATETIME NOT NULL,
    "revertAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "appliedAt" DATETIME,
    "revertedAt" DATETIME
);

-- CreateTable
CREATE TABLE "PriceScheduleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scheduleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "newPrice" TEXT,
    "newCompareAt" TEXT,
    "oldPrice" TEXT,
    "oldCompareAt" TEXT,
    CONSTRAINT "PriceScheduleItem_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "PriceSchedule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
