/*
  Warnings:

  - You are about to drop the column `appliedAt` on the `PriceSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `revertedAt` on the `PriceSchedule` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `PriceSchedule` table. All the data in the column will be lost.
  - Added the required column `payload` to the `PriceSchedule` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PriceSchedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "runAt" DATETIME NOT NULL,
    "revertAt" DATETIME,
    "payload" JSONB NOT NULL,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PriceSchedule" ("createdAt", "error", "id", "revertAt", "runAt", "shop", "status", "updatedAt") SELECT "createdAt", "error", "id", "revertAt", "runAt", "shop", "status", "updatedAt" FROM "PriceSchedule";
DROP TABLE "PriceSchedule";
ALTER TABLE "new_PriceSchedule" RENAME TO "PriceSchedule";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
